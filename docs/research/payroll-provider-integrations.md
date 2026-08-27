# Worker-authorized payroll integrations

Research date: 2026-08-27

## Answer

Tip Tracker can obtain real paystub data after a worker authorizes access, but
not through the public ADP or Homebase APIs in the way this consumer app needs.
A provider-neutral service is the practical route.

This should not ship in the first public release. Every workable service
requires a backend, sends payroll data through a third party, carries a recurring
or usage fee, and introduces consent, deletion, reauthentication, security, and
support work. That conflicts with Tip Tracker's current local-only contract in
[`decisions.md`](../decisions.md) and its published
[`privacy-policy.md`](../privacy-policy.md).

Keep structured Paycheck entry as the first-release path. If demand survives
real use, run a production-access spike with Plaid Payroll Income first and
Pinwheel Verify second. Plaid has the clearest small-team access path. Pinwheel
has the stronger documented paystub and tax breakdown. Do not build separate
ADP and Homebase connectors.

## What the APIs can return

| Option | Relevant data | Who authorizes it | Fit for Tip Tracker |
| --- | --- | --- | --- |
| ADP direct | ADP documents payroll output at pay and detail levels, including earnings and statutory deductions. ADP also points developers to its Pay Statement or Pay Data Output APIs for actual deposited amounts. | An ADP client or accepted Marketplace partner sets up the integration. The client buys API access or installs the Marketplace app and consents to company data transmission. | Poor. This is an employer integration, not a worker connecting only their own account. |
| Homebase direct | The published API documents employees, wage rates, shifts, timecards, labor hours, tips, and labor cost data. I found no published endpoint for paystubs, net pay, withholding, payroll taxes, or deduction lines. | A Homebase account requests an API key and Homebase approves it. Write access requires a partner relationship. | Poor. It can help import work records with employer authorization, but it does not document the completed payroll record Tip Tracker needs. |
| Finch | Pay statements include gross pay, net pay, earnings, taxes, employee deductions, and employer contributions for a pay period. ADP Workforce Now is supported. | The employer authorizes access to company payroll data through Finch Connect. | Wrong authorization model. Finch is a business-to-business payroll connector, not a worker data-portability flow. |
| Argyle | Paystubs include employer, pay date, pay-period dates, gross pay, net pay, hours, taxes, deduction totals, and line-item tax and deduction lists. | The worker connects one or more payroll accounts through Argyle Link and can revoke access. | Technically suitable. Public coverage confirms ADP. I could not confirm Homebase payroll coverage from Argyle's public sources. Production pricing is not public. |
| Pinwheel | Paystubs include pay date, pay-period dates, gross and net pay, year-to-date totals, taxes, deduction lines, reimbursements, and earning categories. | The worker authenticates their payroll account through Pinwheel Link. | Technically suitable. ADP is documented. Homebase is documented as a time-and-attendance source for shifts, not as a source of paystubs, so payroll coverage remains unconfirmed. Production access and pricing require contact with Pinwheel. |
| Plaid Payroll Income | Paystubs include employer, gross earnings, net pay, earning and deduction lines, pay date, pay-period dates, frequency, and optional source PDFs. W-2 records include federal, Social Security, Medicare, state, and local withholding fields. | The worker connects a payroll account in Plaid Link and approves sharing. | Best first vendor to evaluate later. ADP appears in Plaid's official API example. Homebase payroll coverage is not publicly confirmed. Paystub deductions are description-based rather than a guaranteed normalized tax taxonomy. |

Sources for the table:

- ADP limits API access to clients, accepted Marketplace partners, and their
  integrators. It requires client credentials and mutual TLS. Marketplace apps
  also pass technical and security reviews. See ADP's
  [API access FAQ](https://esi.apps.adp.com/en-US/pages/why-marketplace),
  [partner milestones](https://developers.adp.com/articles/preview/guide-partner-development-learning-guide-5?chapter=1),
  and [Payroll Output v2 guide](https://developers.adp.com/articles/preview/guide-payroll-output-api-guide-turbo-api-for-midsized-to-enterprise-businesses-12?chapter=6).
- Homebase's [public API documentation](https://app.joinhomebase.com/api-docs)
  says read-only API keys require approval and partner write access requires a
  Homebase representative. Its published resources are organized by business
  location, employees, shifts, timecards, and labor.
- Finch describes an
  [employer-facing authorization flow](https://developer.tryfinch.com/how-finch-works/finch-overview)
  and [pay-statement fields](https://developer.tryfinch.com/products/payroll/Overview).
  Its public Starter price is [$65 per connected employer per month](https://www.tryfinch.com/pricing),
  with 24 providers and a 15-connection limit. Finch lists ADP Workforce Now,
  but warns that the separate ADP Workforce Now Cloud product is unsupported in
  its [provider setup guide](https://developer.tryfinch.com/integrations/provider-setup).
- Argyle's [paystub schema](https://docs.argyle.com/api-reference/paystubs)
  provides the requested payroll fields. Its
  [worker connection flow](https://docs.argyle.com/workflows/account-connections)
  supports multiple payroll accounts, MFA, reauthorization, revocation, and
  document upload. Argyle's public [coverage directory](https://checkcoverage.argyle.com/)
  lists ADP. Its consumer FAQ says the service provider pays for a connection,
  but does not publish the amount. See the
  [consumer FAQ](https://www.argyle.com/consumers/faq).
- Pinwheel documents the full
  [Income and Employment paystub response](https://docs.pinwheelapi.com/public/v2022-03-02/docs/income-and-employment-1)
  and worker authorization through [Pinwheel Link](https://docs.pinwheelapi.com/public/v2023-07-18/docs/link-1).
  Its sandbox instructions name ADP, while its
  [time-and-attendance guide](https://docs.pinwheelapi.com/public/v2022-03-02/docs/supplement-shifts-with-ta-platforms)
  names Homebase only as a source of shifts. Pinwheel's product pages route
  production prospects to sales rather than publishing prices.
- Plaid documents a worker-connected
  [Payroll Income flow](https://plaid.com/docs/income/payroll-income/) with
  approximately 80 percent US-workforce coverage. Its
  [Income API schema](https://plaid.com/docs/api/products/income/) includes an
  ADP example and the paystub and W-2 fields described above. Payroll Income has
  a one-time fee, refreshes have a per-request fee, and exact prices require
  Production access or sales contact. Plaid lists Income on its
  [Pay as You Go plan](https://plaid.com/pricing/) and permits limited live-data
  testing before a larger commitment.

## Architecture and privacy cost

None of these integrations preserves a strictly local-only app.

- ADP requires server-held client credentials and mutual TLS certificates.
- Argyle says API calls and user-token creation belong on the server so its API
  secret is never exposed in client code. See its
  [API security guidance](https://docs.argyle.com/api-guide/overview) and
  [user-token guide](https://docs.argyle.com/link/user-tokens).
- Pinwheel requires server-side creation of short-lived Link tokens and says API
  secrets must not be stored in client software. It provides native and React
  Native Link SDKs, so the iOS interface is feasible once a backend exists. See
  [Getting Started](https://docs.pinwheelapi.com/public/docs/link-getting-started).
- Plaid also creates Link tokens on the server, receives asynchronous webhooks,
  and retrieves payroll data from a server-side endpoint. See
  [Add Income to your app](https://plaid.com/docs/income/add-to-app/).

A production design would therefore need a small authenticated backend that
maps the device or app user to the aggregator's user ID, creates short-lived
connection tokens, receives webhooks, fetches paystubs, and sends only selected
normalized fields to the app. Long-lived vendor secrets and payroll-provider
credentials must never enter SQLite or the app bundle.

The product would also need explicit consent and revocation screens, a deletion
workflow covering both Tip Tracker and the vendor, retention limits, encrypted
transport and storage, incident handling, and updated App Store disclosures and
privacy policy. This is not paperwork around the feature. It is part of the
feature. Argyle states that payroll data is available through its cloud API and
becomes unavailable after revocation in its
[data-security documentation](https://docs.argyle.com/overview/data-security).
Pinwheel's terms require customers to obtain the necessary consents, keep API
keys out of client software, follow applicable law, and use reasonable security
safeguards in its [customer terms](https://www.pinwheelapi.com/about/terms).
Plaid explains that payroll data remains in its systems as needed and is
deleted after a connection is removed subject to stated exceptions in its
[privacy policy](https://plaid.com/legal/).

## Release recommendation

For the first public release:

1. Let the worker enter an actual Paycheck using gross pay, deposited net pay,
   employer or Job, pay date, and pay-period dates.
2. Keep taxes, withholding, benefits, retirement, garnishments, and custom
   deduction lines optional.
3. Preserve unknown values as unknown. Do not infer a missing deduction as zero.
4. Treat payroll connection as a later opt-in import method for the same
   Paycheck model, not as a second payroll model.

For a later integration spike:

1. Ask Plaid and Pinwheel to confirm in writing that personal budgeting and tax
   estimation are approved uses, not only income verification or underwriting.
2. Obtain current price quotes and minimum commitments.
3. Test real ADP and Homebase worker accounts. Public network-wide coverage
   claims do not prove that the exact provider variant returns every required
   field.
4. Compare field completeness across at least gross pay, net pay, pay-period
   dates, federal withholding, Social Security, Medicare, state and local tax,
   benefits, retirement, garnishments, and custom deductions.
5. Design the backend, consent, retention, deletion, and support contract before
   selecting a vendor.

## Uncertainties that require vendor confirmation

- Whether Homebase Payroll currently exposes worker paystubs through Argyle,
  Pinwheel, or Plaid. Public sources do not confirm it.
- Which ADP variants each neutral provider supports in production and whether
  each variant exposes tax and deduction line items.
- Production approval for a self-directed personal-finance app.
- Current per-connection fees, minimum monthly commitments, refresh fees, and
  document-download fees for Argyle and Pinwheel.
- How much historical payroll data each provider and employer combination makes
  available.
