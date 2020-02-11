# proto2slate

A tool for converting .proto files to markdown for Slate.

## Usage

`proto2slate` takes two arguments, a required path to a [Protocol Buffers](https://developers.google.com/protocol-buffers) v3 definition file followed by an optional path to the output markdown file.

### In a project

First install `proto2slate` in your project.

```bash
npm install proto2slate
```

Then you can create an npm script to run the tool.

```json
"scripts": {
  "slate": "proto2slate service.proto service.md"
}
```

### Standalone

You can also install and run `proto2slate` as a standalone tool.

```bash
npm install -g proto2slate
proto2slate /path/to/service.proto /path/to/service.md
```
