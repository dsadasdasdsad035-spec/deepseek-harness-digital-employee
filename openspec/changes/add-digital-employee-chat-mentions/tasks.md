## 1. Durable Employee Task Identity

- [x] 1.1 Add failing digital employee Agent tests for creation-time employee ownership, resolved template identity, and restoration after instance metadata changes.
- [x] 1.2 Extend the required Session event vocabulary and digital employee root composition to record the employee instance, template version, and resolved composition identity.
- [x] 1.3 Update known event registration, persistence/projection expectations, TypeScript SDK fixtures, Python SDK fixtures, and persistence documentation for the ownership event.

## 2. Atomic Host Task Startup

- [x] 2.1 Add failing Host tests for successful first-message admission, inactive and missing-template rejection, empty task rejection, duplicate submission, and cleanup after message-admission failure.
- [x] 2.2 Define typed start-task request and result values carrying employee, Session, submission, content, attachment, and abort identities.
- [x] 2.3 Implement the digital employee Agent/Host startup transaction that resolves composition, creates the root Agent, submits the first user message through the standard path, and disposes unpublished partial work on failure.
- [x] 2.4 Replace or narrow the existing empty `runTask` Remote operation and update Typert generation and gateway tests without introducing namespace method conflicts.

## 3. Generic Composer Routing Extension

- [x] 3.1 Add failing input-machine and input-reference tests for leading routing references, one-owner enforcement, editing invalidation, undo/redo, and routing claims that do not serialize into prompt text.
- [x] 3.2 Extend the input trigger/reference contracts with a plugin-owned routing submission contribution while keeping ordinary model reference serialization unchanged.
- [x] 3.3 Preserve draft text, routing reference, attachments, and submission-attempt idempotency across failed or aborted routed submissions.

## 4. Digital Employee Mention Client

- [x] 4.1 Add failing digital employee store and component tests for active employee discovery, unavailable rows, structured selection, invalidation, successful navigation, and failed-start draft retention.
- [x] 4.2 Register the digital employee `@` source and picker rows with name, template, and availability state, restricted to the new-task leading position.
- [x] 4.3 Connect routed submission to the atomic Remote task-start operation and select the returned Session only after success.
- [x] 4.4 Replace management `Run task` with `Start chat`, opening a distinct new-task composer with the employee preselected and no empty Session creation.

## 5. Application Composition

- [x] 5.1 Update Remote client exports, package manifests, compiler faces, resolver manifests, and Web bundle composition for the new client and Host paths.
- [x] 5.2 Add assembly tests proving the employee mention source, routed submit contribution, Remote namespace, and management-to-chat navigation are mounted exactly once.
- [x] 5.3 Run focused package typechecks and built-lib Remote smokes under Node 22 and fix all composition failures.

## 6. User-Visible Coverage

- [x] 6.1 Extend the runnable digital employee fixture so the first task is submitted through the new task-start operation and the transcript proves employee ownership.
- [x] 6.2 Update the keyless digital employee snapshot for first-message handling, expert delegation, memory behavior, and final output.
- [x] 6.3 Extend the Web end-to-end test to type `@`, select an employee, submit a task, enter the new conversation, and start the same flow from employee management.
- [x] 6.4 Record and verify the required GUI demonstration GIF from the real Web application flow.

## 7. Documentation and Verification

- [x] 7.1 Update affected package READMEs and JSDoc for chat mention registration, atomic startup, ownership events, and management `Start chat`.
- [x] 7.2 Update English and Chinese digital employee user guides, architecture documentation, persistence catalog, and i18n metadata.
- [x] 7.3 Add an Agent Note describing the durable employee-chat routing decision and archive superseded notes when required.
- [x] 7.4 Run the focused tests selected by `dsh-pre-push-checks`, relevant typechecks/build smokes, keyless snapshot, Web E2E, `doc-sync`, OpenSpec strict validation, and `git diff --check`.
