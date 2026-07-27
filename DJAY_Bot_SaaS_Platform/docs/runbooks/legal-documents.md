# Approved legal documents and registration

New workspace registration is authorized only while the API can read one
approved, versioned legal-document bundle. The repository does not contain or
invent customer terms, privacy promises, retention commitments, processor
disclosures, or legal approval.

## Runtime contract

Mount the reviewed JSON document read-only into the API runtime and set:

```bash
LEGAL_DOCUMENTS_FILE=/run/secrets/djay-legal-documents.json
```

The path must be absolute. The file must be smaller than 1 MiB and conform to
`djay.legal-documents.v1`:

```json
{
  "schema": "djay.legal-documents.v1",
  "approvalStatus": "approved",
  "approvalReference": "reference-to-signed-approval-artifact",
  "approvedAt": "2026-07-16T08:00:00+07:00",
  "terms": {
    "version": "terms-version-key",
    "title": "reviewed title",
    "effectiveDate": "YYYY-MM-DD",
    "summary": "reviewed summary",
    "sections": [{ "heading": "reviewed heading", "paragraphs": ["reviewed plain text"] }],
    "translations": {
      "th": {
        "title": "ชื่อภาษาไทยที่ได้รับอนุมัติ",
        "summary": "สรุปภาษาไทยที่ได้รับอนุมัติ",
        "sections": [{ "heading": "หัวข้อที่ได้รับอนุมัติ", "paragraphs": ["เนื้อหาภาษาไทยที่ได้รับอนุมัติ"] }]
      }
    }
  },
  "privacy": {
    "version": "privacy-version-key",
    "title": "reviewed title",
    "effectiveDate": "YYYY-MM-DD",
    "summary": "reviewed summary",
    "sections": [{ "heading": "reviewed heading", "paragraphs": ["reviewed plain text"] }],
    "translations": {
      "th": {
        "title": "ชื่อภาษาไทยที่ได้รับอนุมัติ",
        "summary": "สรุปภาษาไทยที่ได้รับอนุมัติ",
        "sections": [{ "heading": "หัวข้อที่ได้รับอนุมัติ", "paragraphs": ["เนื้อหาภาษาไทยที่ได้รับอนุมัติ"] }]
      }
    }
  }
}
```

This shape example is not approved legal content. Replace every example value
with the signed artifact exactly. Versions use lowercase letters, numbers,
dots, underscores, or hyphens and the Terms and Privacy versions must differ.
Content is rendered as React text; HTML is neither required nor accepted as
markup. Both `translations.th` objects must be approved as part of the same
versioned artifact. They are required for the Thai-default public experience;
do not insert machine-generated or otherwise unapproved legal text.

## Fail-closed behavior

- Missing configuration keeps Terms and Privacy in an explicit unavailable
  state and disables **Create workspace**.
- A bundle without approved `translations.th` keeps the Thai Terms and Privacy
  routes unavailable and registration paused. The English source is returned
  only when the visitor explicitly selects English.
- Invalid, draft, oversized, relative-path, or unreadable configuration fails
  API service initialization with a path-neutral error.
- Email verification and resend remain available for already-created signup
  intents when new registration is paused.
- The browser submits the exact Terms and Privacy versions it displayed.
  Registration compares both to current server authority before hashing a
  password, writing a signup intent, or sending email.
- A document rotation during form completion returns
  `legal_version_changed`; the form preserves entered account data, clears
  acceptance, reloads metadata, and requires review and acceptance again.

## Promotion and rotation

1. Obtain the signed legal/privacy artifact and immutable approval reference.
2. Validate the candidate with the shared schema and run the full verification
   suite.
3. Write the new file at a separate path, set owner/read-only permissions, and
   atomically switch the deployment mount or secret revision.
4. Restart or roll the API. Do not mutate a mounted file in place.
5. Require `GET /public/legal`, `GET /public/legal/terms`, and
   `GET /public/legal/privacy` to return the approved Thai versions. Repeat
   with `?lang=en` and confirm the approved English source is returned.
6. Open `/terms` and `/privacy` through the public load balancer at desktop and
   mobile sizes, then create a test signup and verify the persisted acceptance
   references the same versions.

Rollback restores the previous complete approved bundle and API revision
together. It does not rewrite historical acceptance rows. If approval is
withdrawn and no replacement is authorized, remove the mount and keep new
registration paused.
