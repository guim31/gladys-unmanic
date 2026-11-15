# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

The integration talks to one Unmanic server on your local network. Unmanic has
no authentication of its own; the optional user name and password are those of
a reverse proxy, stored by Gladys in the integration configuration, sent as an
HTTP Basic header and never logged. The integration stores under `/data` only
the address of the server read last, the ids and names of the workers seen, and
the id of the newest completed task (`unmanic-state.json`). It opens no inbound
port, and its only commands are pausing and resuming the workers (off by
default).

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and Unmanic, whose API is open to anyone on your network.
