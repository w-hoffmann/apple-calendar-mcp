# Server Metadata Specification

## Purpose

Ensure the MCP server reports an accurate, single-sourced version to clients
during the initialize handshake, so the advertised version cannot drift from the
package. Backed by `src/index.ts`, which reads the version from `package.json` at
startup rather than from a hardcoded literal.

## Requirements

### Requirement: Server reports a consistent version

The MCP server SHALL report, in the initialize handshake, a version string equal to the version declared in package.json.

#### Scenario: Version matches package.json

- **WHEN** a client initializes the connection to the MCP server
- **THEN** the server's reported version equals package.json's `version` field
- **AND** no hardcoded version literal in the source can diverge from package.json
