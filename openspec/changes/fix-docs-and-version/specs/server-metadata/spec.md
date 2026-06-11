# Server Metadata Specification

## ADDED Requirements

### Requirement: Server reports a consistent version

The MCP server SHALL report, in the initialize handshake, a version string equal to the version declared in package.json.

#### Scenario: Version matches package.json

- **WHEN** a client initializes the connection to the MCP server
- **THEN** the server's reported version equals package.json's `version` field
- **AND** no hardcoded version literal in the source can diverge from package.json
