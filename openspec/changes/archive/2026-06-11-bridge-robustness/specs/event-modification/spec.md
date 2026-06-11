## ADDED Requirements

### Requirement: Validate update inputs

The `update_event` tool SHALL reject inputs that cannot form a valid event,
returning a clear error rather than silently succeeding or emitting an opaque
underlying error.

#### Scenario: Empty title is rejected

- **WHEN** `update_event` is invoked with `title` set to an empty string
- **THEN** the system returns a tool result flagged as an error
- **AND** the error text indicates the title must not be empty

#### Scenario: Inverted time range is rejected

- **WHEN** `update_event` is invoked such that the resulting `startDate` is at or
  after the resulting `endDate`
- **THEN** the system returns a tool result flagged as an error
- **AND** the error text indicates that start must be before end
- **AND** the event is not modified

#### Scenario: Unrecognized recurrence span is rejected

- **WHEN** `update_event` is invoked with a `span` value other than `"this"` or
  `"future"`
- **THEN** the system returns a tool result flagged as an error
- **AND** the span is not coerced to a default value

#### Scenario: Conflicting all-day flags are rejected

- **WHEN** the bridge is invoked with both an all-day and a non-all-day flag for
  the same update
- **THEN** the system returns a tool result flagged as an error
- **AND** the flags are not silently resolved to a single value
