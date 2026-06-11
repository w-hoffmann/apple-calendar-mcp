## ADDED Requirements

### Requirement: Validate creation inputs

The `create_event` tool SHALL reject inputs that cannot form a valid event,
returning a clear, accurate error rather than silently ignoring the input,
succeeding, or emitting an opaque underlying error, and SHALL behave
consistently with `update_event`.

#### Scenario: Invalid time-zone identifier is rejected

- **WHEN** `create_event` is invoked with a `timeZone` that is not a valid
  identifier (e.g. `"Not/AZone"`)
- **THEN** the system returns a tool result flagged as an error
- **AND** the error text identifies the time zone as the cause
- **AND** the error text does not claim the input was an invalid date

#### Scenario: Empty title is rejected

- **WHEN** `create_event` is invoked with `title` set to an empty string
- **THEN** the system returns a tool result flagged as an error
- **AND** the error text indicates the title must not be empty

#### Scenario: Inverted time range is rejected

- **WHEN** `create_event` is invoked such that `startDate` is at or after
  `endDate`
- **THEN** the system returns a tool result flagged as an error
- **AND** the error text indicates that start must be before end
- **AND** no event is created
