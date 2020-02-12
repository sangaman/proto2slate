#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

function writeLine(text: string) {
  slateStream.write(text);
  slateStream.write('\n');
}

const protoFile = process.argv[2];
if (!protoFile) {
  console.error('no proto file provided');
  process.exit(1);
}

const proto = fs.readFileSync(protoFile, 'utf8');

const protoBasename = path.basename(protoFile);
const protoFilename = protoBasename.includes('.') ? protoBasename.substr(0, protoBasename.indexOf('.')) : protoBasename;
const slateFile = process.argv[3] || path.join(process.cwd(), `${protoFilename}.md`);

const slateStream = fs.createWriteStream(slateFile);

type Service = {
  name: string;
  comment: string;
  calls: RpcCall[];
};

type RpcCall = {
  name: string;
  requestType: string;
  responseType: string;
  comment: string;
  stream: boolean;
  shell?: string;
};

type Message = {
  name: string;
  fields: Field[];
}

type Field = {
  name: string;
  type: string;
  comment: string;
  repeated: boolean;
  key?: string;
}

type Enum = {
  name: string;
  values: string[];
}

const services: Service[] = [];
const messages = new Map<string, Message>();
const enums = new Map<string, Enum>();

function printFields(fields: Field[]) {
  writeLine('Parameter | Type | Description');
  writeLine('--------- | ---- | -----------');
  fields.forEach((field) => {
    let typeStr: string;
    if (field.key) {
      typeStr =`map&lt;${field.key}, ${formatFieldType(field)}&gt;`;
    } else {
      typeStr = `${formatFieldType(field)}${field.repeated ? ' array' : ''}`;
    }
    writeLine(`${field.name} | ${typeStr} | ${field.comment}`);
  });
}

function formatFieldType(field: Field) {
  if (messages.has(field.type) || enums.has(field.type)) {
    return `[${field.type}](#${field.type.toLowerCase()})`;
  } else {
    return field.type; 
  }
}

function snakeToCamelCase(val: string) {
  return val.replace(/(\_\w)/g, (m) => m[1].toUpperCase());
}

const lines = proto.split('\n');
let index = 0;
while (index < lines.length) {
  const line = lines[index].trimLeft();
  if (line.startsWith('service ')) {
    const serviceName = line.substring(8, line.length - 1).trimRight();
    let serviceComment = '';
    let commentIndex = 1;
    let commentLine = lines[index - commentIndex].trimLeft();
    while (commentLine !== undefined && commentLine.startsWith('/*') || commentLine.startsWith('*')) {
      serviceComment = commentLine.replace(/^[\*\/ ]+|[\*\/ ]+$/g, '') + (serviceComment ? ' ' : '') + serviceComment;
      commentIndex += 1;
      commentLine = lines[index - commentIndex].trimLeft();
    }
    services.push({
      name: serviceName,
      comment: serviceComment,
      calls: [],
    });
  } else if (line.startsWith('rpc ')) {
    const name = line.substring(4, line.indexOf('(')).trim();
    const requestType = line.substring(line.indexOf('(') + 1, line.indexOf(')')).trim();
    const responseDefinition = line.substring(line.lastIndexOf('(') + 1, line.lastIndexOf(')')).trim();
    const stream = responseDefinition.startsWith('stream ');
    const responseType = stream ? responseDefinition.substring(7) : responseDefinition;
    let shell: string | undefined;

    let commentIndex = 1;
    let commentLine = lines[index - commentIndex].trimLeft();
    let comment = '';
    while (commentLine !== undefined && commentLine.startsWith('/*') || commentLine.startsWith('*')) {
      const trimmedCommentLine = commentLine.replace(/^[\*\/ ]+|[\*\/ ]+$/g, '');
      if (trimmedCommentLine.startsWith('shell: ')) {
        shell = trimmedCommentLine.substring(7) + (shell ? '\n' + shell : '');
      } else {
        comment = trimmedCommentLine + (comment ? ' ' : '') + comment;
      }
      commentIndex += 1;
      commentLine = lines[index - commentIndex].trimLeft();
    }

    services[services.length - 1].calls.push({ name, requestType, responseType, stream, comment, shell });
  } else if (line.startsWith('message ')) {
    const name = line.substring(8).replace(/[{} ]/g, '')

    const fields: Field[] = [];
    if (!line.includes('}')) {
      let fieldIndex = 1;
      let comment = '';
      let openBracket = false;
      while (index + fieldIndex < lines.length) {
        const fieldLine = lines[index + fieldIndex].trimLeft();

        if (fieldLine.startsWith('/')) {
          // this line is a comment'
          comment += (comment ? ' ' : '') + fieldLine.replace(/^[\*\/ ]+|[\*\/ ]+$/g, '');
        } else if (fieldLine.includes('{')) {
          openBracket = true;
        } else if (fieldLine.includes('}')) {
          if (openBracket) {
            openBracket = false;
          } else {
            break;
          }
        } else if (fieldLine.startsWith('map<')) {
          const [key, type] = fieldLine.substring(4, fieldLine.indexOf('>')).split(', ');
          const fieldName = fieldLine.substring(fieldLine.indexOf('>') + 1, fieldLine.indexOf('=')).trim();
          fields.push({ name: fieldName, type, comment, repeated: false, key });
          comment = '';
        } else if (fieldLine.length > 0 &&
          !fieldLine.startsWith('enum ') &&
          !fieldLine.startsWith('oneof ') &&
          fieldLine.split(' ').length > 3) {
          // this line is a field
          const repeated = fieldLine.startsWith('repeated');
          const tokens = fieldLine.split(' ');
          const type = tokens[repeated ? 1 : 0];
          const fieldName = tokens[repeated ? 2 : 1];
          fields.push({ name: fieldName, type, comment, repeated });
          comment = '';
        }
  
        fieldIndex += 1;
      }
    }

    messages.set(name, { name, fields });
  } else if (line.startsWith('enum ')) {
    const name = line.substring(5, line.length - 1).trim();
    
    let commentIndex = 1;
    let commentLine = lines[index - commentIndex].trimLeft();
    let comment = '';
    while (commentLine !== undefined && commentLine.startsWith('//')) {
      comment = commentLine.replace(/^[\*\/ ]+|[\*\/ ]+$/g, '') + (comment ? ' ' : '') + comment;
      commentIndex += 1;
      commentLine = lines[index - commentIndex].trimLeft();
    }

    let enumIndex = 1;
    let enumLine = lines[index + enumIndex].trimLeft();
    const values: string[] = [];
    while (enumLine !== undefined && !enumLine.includes('}')) {
      const tokens = enumLine.split('=');
      const enumName = tokens[0].trimRight();
      values.push(enumName);
      enumIndex += 1;
      enumLine = lines[index + enumIndex].trimLeft();
    }

    enums.set(name, { name, values });
  }
  index += 1;
}


writeLine(`---
title: API Reference

language_tabs:
  - shell
  - javascript
  - python

toc_footers:
  - <a href='https://github.com/lord/slate'>Documentation Powered by Slate</a>

search: true
---`);

services.forEach((service) => {
  const serviceNameLower = service.name.toLowerCase();

  writeLine(`# ${service.name} Service`);

  writeLine(`\`\`\`javascript
var fs = require('fs');
var grpc = require('grpc');
var options = {
  convertFieldsToCamelCase: true,
  longsAsStrings: true,
};
var ${serviceNameLower}Proto = grpc.load('${protoBasename}', 'proto', options);
var tlsCert = fs.readFileSync('path/to/tls.cert');
var sslCreds = grpc.credentials.createSsl(tlsCert);
var ${serviceNameLower}Client = new ${serviceNameLower}Proto.${service.name}(host + ':' + port, sslCreds);
\`\`\``);

  writeLine(`\`\`\`python
# Python requires you to generate static protobuf code, see the following guide:
# https://grpc.io/docs/tutorials/basic/python.html#generating-client-and-server-code

import grpc
import ${protoFilename}_pb2 as ${serviceNameLower}, ${protoFilename}_pb2_grpc as ${serviceNameLower}rpc
cert = open('path/to/tls.cert', 'rb').read()
ssl_creds = grpc.ssl_channel_credentials(cert)
channel = grpc.secure_channel(host + ':' + port, ssl_creds)
${serviceNameLower}_stub = ${protoFilename}.${service.name}Stub(channel)
\`\`\``);

  writeLine(service.comment);
    
  service.calls.forEach((call) => {
    writeLine(`## ${call.name}`);

    const request = messages.get(call.requestType)!;
    const response = messages.get(call.responseType)!;

    writeLine('```javascript');
    if (request.fields.length === 0) {
      writeLine('var request = {};');
    } else {
      writeLine('var request = {');
      request.fields.forEach((field) => {
        writeLine(`  ${snakeToCamelCase(field.name)}: <${field.type}${field.repeated ? '[]' : ''}>,`);
      })
      writeLine('};');
    }
    
    if (call.stream) {
      writeLine(`
var call = ${serviceNameLower}Client.${call.name.charAt(0).toLowerCase() + call.name.substring(1)}(request);
call.on('data', function (response) {
  console.log(response);
});
call.on('error', function (err) {
  console.error(err);
});
call.on('end', function () {
  // the streaming call has been ended by the server
});`);
    } else {
      writeLine(`
${serviceNameLower}Client.${call.name.charAt(0).toLowerCase() + call.name.substring(1)}(request, function(err, response) {
  if (err) {
    console.error(err);
  } else {
    console.log(response);
  }
});`);
    }

    if (response.fields.length === 0) {
      writeLine('// Output: {}');
    } else {
      writeLine('// Output:');
      writeLine('// {');
      response.fields.forEach((field, index) => {
        writeLine(`//  "${snakeToCamelCase(field.name)}": <${field.type}${field.repeated ? '[]' : ''}>${index < response.fields.length - 1 ? ',' : ''}`);
      })
      writeLine('// }');
    }
    writeLine('```');

    writeLine('```python');
    if (request.fields.length === 0) {
      writeLine(`request = ${serviceNameLower}.${request.name}()`);
    } else {
      writeLine(`request = ${serviceNameLower}.${request.name}(`);
      request.fields.forEach((field) => {
        writeLine(`  ${field.name}=<${field.type}${field.repeated ? '[]' : ''}>,`);
      })
      writeLine(')');
    }

    if (call.stream) {
      writeLine(`for response in stub.${call.name}(request):
  print(response)`);
    } else {
      writeLine(`response = ${serviceNameLower}Stub.${call.name}(request)
print(response)`);
    }

    if (response.fields.length === 0) {
      writeLine('# Output: {}');
    } else {
      writeLine('# Output:');
      writeLine('# {');
      response.fields.forEach((field, index) => {
        writeLine(`#  "${field.name}": <${field.type}${field.repeated ? '[]' : ''}>${index < response.fields.length - 1 ? ',' : ''}`);
      })
      writeLine('# }');
    }
    writeLine('```');

    if (call.shell) {
      writeLine(`\`\`\`shell
  ${call.shell}
  \`\`\``);
    }

    writeLine(call.comment);

    writeLine('### Request');
    if (!request || request.fields.length === 0) {
      writeLine('This request has no parameters.');
    } else {
      printFields(request.fields);
    }

    if (call.stream) {
      writeLine('### Response (Streaming)');
    } else {
      writeLine('### Response');
    }
    if (!response || response.fields.length === 0) {
      writeLine('This response has no parameters.');
    } else {
      printFields(response.fields); console
    }
  });
});

writeLine('# Messages');
messages.forEach((message) => {
  writeLine(`## ${message.name}`);
  
  if (message.fields.length === 0) {
    writeLine('This message has no parameters.');
  } else {
    printFields(message.fields);
  }
});

writeLine('# Enums');
enums.forEach((enumVal) => {
  writeLine(`## ${enumVal.name}`);
  writeLine('Enumeration | Value | Description');
  writeLine('----------- | ----- | -----------');

  for (let n = 0; n < enumVal.values.length; n += 1) {
    writeLine(`${enumVal.values[n]} | ${n} |`);
  }
});

console.log(`slate markdown written to ${slateFile}`);
