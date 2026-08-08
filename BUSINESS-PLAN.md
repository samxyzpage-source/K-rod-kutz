# Hallway — the operating system for the student service economy

**One line:** A school-verified marketplace where student-run service businesses (barbers, lash techs, tutors, sneaker cleaners, photographers) get a booking page, a schedule, SMS reminders, and a reputation — scaled one campus at a time.

---

## 1. Where this idea comes from

This repo already contains the clue. `index.html` is a professional landing page for a real Miami barber — and the only thing that page *does* is push visitors to Booksy, a $30+/month booking platform built for licensed, adult professionals.

Now look inside any high school. There is a real, cash-generating service economy that nobody serves:

- Student barbers doing 8–15 cuts a week out of a garage at $15–25 each
- Lash and nail techs booked out before homecoming
- Tutors, sneaker cleaners, phone-screen repairers, cake bakers, prom photographers

All of it runs on Instagram DMs and Cash App. That means:

- **Scheduling is chaos.** Bookings live in DM threads. Double-bookings and no-shows are constant, and a no-show costs a student barber a real chunk of weekly income.
- **Discovery is word of mouth only.** A great student barber is invisible two lunch tables away.
- **Reputation isn't portable.** Three years of five-star cuts evaporates at graduation.
- **Incumbents are locked out.** Booksy, StyleSeat, Fiverr, TaskRabbit and Stripe all require sellers to be 18+, licensed, or both.

That last point is the whole opportunity: **the under-18 constraint that keeps billion-dollar companies out of this market is trivially navigable for a student founder operating inside it.** You don't need a licensed-professional platform. You need a trusted, school-scoped one.

## 2. The product

Hallway is a web app scoped to one school at a time. Three pieces:

**1. Seller pages.** Every seller gets a page like the K Rod Kutz site in this repo — services, prices, photo gallery, book button — generated from a template in five minutes instead of built by hand. (This repo's `index.html` is literally seller-page v0; `hallway.html` in this repo is the pitch prototype.) An LLM-powered setup flow asks five questions ("what do you do, what do you charge, show me three photos…") and writes the page copy and layout for them.

**2. Booking + reminders.** A real calendar with open slots, automatic SMS confirmations and day-before reminders. This is the measurable wedge: SMS reminders reliably cut no-show rates, and for a seller doing $200/week, killing no-shows is an immediate, feelable raise. Sellers adopt tools that make them money in week one.

**3. School-verified trust graph.** You join with your school email or an invite from a verified student. Real names, public reviews, a reliability score on both sides (sellers get no-show data on buyers too). Discovery is scoped to your campus — a directory of everyone at your school who does anything, searchable, ranked by rating.

### Tech elements (buildable by a student, genuinely differentiating)

- **AI page generator** — five-question onboarding → finished seller page (copy, service menu, theme). The repo's barber page becomes the first template.
- **Scheduling engine** with conflict detection and buffer times.
- **SMS layer** (Twilio) for confirmations, reminders, and "slot just opened" waitlist pings.
- **Demand calendar** — the platform knows homecoming/prom/picture-day dates per school and prompts sellers to open extra slots and raise prices into demand spikes.
- **No-show score** — both sides. This data exists nowhere else and compounds.
- **DM importer** — paste your Instagram booking thread, an LLM extracts the appointments and seeds your calendar. Migration is the hardest part of any marketplace; this makes it one paste.

## 3. Why it scales (and the web agency doesn't)

A web agency sells hours: every new client costs the same effort as the last. Hallway is software: the marginal cost of school #50 is near zero, and each school is a self-contained, dense, pre-networked graph where one ambassador can seed the whole market.

The campus-by-campus playbook is the most proven distribution strategy in consumer software (Facebook, GroupMe, Fizz all used it): launch only where you can hit density, and inside a 1,500-person school, 10 sellers and one homecoming is density.

**Compounding moats as it scales:**

1. **The trust graph.** Reviews + reliability scores scoped to verified school communities can't be copied by a generic marketplace.
2. **Reputation portability.** A senior graduates with a public record of 300 rated cuts — that's a resume for a barber-school application or a chair at a real shop. Sellers won't abandon their history.
3. **The compliance headache is the barrier to entry.** Serving minors is exactly the kind of legal/moderation overhead big platforms deprioritize forever.

## 4. The math

Assumptions for one 1,500-student school (deliberately conservative):

| Metric | Estimate |
|---|---|
| Active sellers per school | 25 (5–10 barbers, 5 beauty, 5 tutors, ~5 misc) |
| Avg seller revenue | $120/week |
| School-year GMV (36 weeks) | ~$108,000 per school |
| Year-1 monetization | Seller Pro at $6/mo (analytics, featured placement, waitlist) + $19 featured spots during prom/homecoming weeks |
| Year-1 revenue per school | ~$1,500–2,500 |
| Later monetization | 5% take on payments once rails are solved → ~$5,000+/school/year |

Costs are a student's costs: free-tier hosting (Vercel/Supabase), ~$0.01 per SMS, one domain. A single school covers its own costs at ~15 Pro subscribers.

Scaling: 10 schools (one metro, year 1) → 100 schools (year 3) ≈ **$500k+/year at the take-rate stage**, run by a distributed network of student ambassadors who earn a cut of their school's revenue.

**Payments sequencing (the honest hard part):** minors can't open Stripe merchant accounts. V1 keeps payments off-platform (cash/Cash App in person) and charges sellers a subscription — this sidesteps money-transmission licensing entirely while the booking layer builds habit and data. The take-rate phase comes later, via an adult-operated entity or teen-account rails, once volume justifies it.

## 5. Go-to-market: the first school is yours

1. **Weeks 1–2 — talk to supply.** Interview 10 campus sellers, starting with barbers (this repo proves the network exists). Map their week: how they book, what a no-show costs, what they'd pay to fix it.
2. **Weeks 3–6 — build the MVP.** Next.js + Supabase + Twilio. Seller pages from the template, booking calendar, SMS reminders. No payments, no app store — a web app shared by link, because that's how DM-native commerce already moves.
3. **Weeks 7–8 — seed and launch.** Hand-onboard 10 sellers. Launch the week before homecoming, when demand for cuts/lashes/nails spikes and every seller's DMs are already overflowing — the product sells itself as overflow management.
4. **Weeks 9–12 — prove the numbers.** Track three things: no-show rate before/after, rebooking rate, and weekly seller revenue. Those three numbers *are* the pitch deck.
5. **Then replicate.** Write the ambassador playbook from what worked, recruit one entrepreneurial student at a neighboring school (DECA chapters are a recruiting pipeline built for exactly this), and launch school #2 without you present. That's the scalability test.

## 6. Risks, honestly

| Risk | Answer |
|---|---|
| **Safety (minors transacting with minors)** | School-scoped and verified, real names, public reviews, meet-in-public defaults, report/block tooling, parent-visible profiles. The trust model is the product, not an afterthought. |
| **School administration pushback** | Don't sneak — pitch it as entrepreneurship infrastructure. Align with DECA/business teachers; a principal who bans it is a principal who wasn't offered a partnership first. |
| **Payments compliance** | Solved by sequencing (subscription first, off-platform payments) — see §4. |
| **Sellers stay in DMs** | The DM importer + no-show savings are the migration answer; the tool must make more money than it costs attention in week one, or it deserves to lose. |
| **Seasonality** (summer cliff) | Lean into it: summer is when student barbers work *most*. School scoping matters for trust, not for the calendar. |
| **Copycats** | Speed to density per campus + the accumulated trust graph. A copycat at your school starts with zero reviews the week after homecoming. |

## 7. Why this is original

Nearest neighbors, and why none of them is this:

- **Booksy / StyleSeat** — booking ops, but adults-only, license-gated, $30+/month.
- **Fiverr / TaskRabbit** — service marketplaces, 18+, global and anonymous — the opposite of a trust graph.
- **Fizz / Sidechat** — campus-scoped networks, but anonymous and social; commerce is an untrusted afterthought.
- **Nextdoor** — hyperlocal trust graph… of parents.

The combination — **verified school-scoped community + real booking operations + portable teen reputation** — doesn't exist, and the reason it doesn't exist (under-18 compliance friction) is a barrier that favors the student founder, not the incumbent.

---

*Prototype pitch page: [`hallway.html`](./hallway.html). Seller-page template ancestor: [`index.html`](./index.html).*
