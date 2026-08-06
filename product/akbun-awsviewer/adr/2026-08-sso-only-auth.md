# IAM Identity Center only, no access keys

## Decision

The app authenticates through IAM Identity Center (SSO) exclusively: it parses ~/.aws/config for profiles, runs the OIDC device authorization flow itself, and shares the token cache with the AWS CLI. ~/.aws/credentials is never read and long-lived access keys are unsupported.

## Reason

A desktop viewer holding long-lived keys is a credential theft target with nothing to show for it — Identity Center tokens expire in hours and the roles they resolve to are already scoped. Sharing ~/.aws/sso/cache with the CLI also means an existing `aws sso login` session works immediately, and a login made in the app works in the CLI, so the app never invents a second session store to keep consistent.
