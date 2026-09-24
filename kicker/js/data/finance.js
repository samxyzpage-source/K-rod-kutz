/**
 * Road to Glory: Kicker — money catalogue (SPEC §2.7.10 money; engine/finance.js → RTG.Finance).
 *
 * RTG.Data.finance = { purchases, services, investments, purchasesById, servicesById, investmentsById }
 *
 * Every price is $k. The engine multiplies by Finance.scale(state) (Tuning.finance.scale), which is 1 in both leagues
 * since D28 — the $25k truck costs $25k in college and in the NFL; the pros simply earn more. "Mostly lifestyle, a little bit of play":
 * purchases and the lifestyle plan move the soft meters only (morale / fame / fans / trust); the three services are
 * the only money that reaches a kick, and they act through the ordinary one-season Modifier machinery
 * (Finance.applyServices); investments carry real risk and real loss.
 *
 * Purchase   = { id, name, price ($k), upkeep ($k/yr, charged every offseason while owned),
 *                effects: {morale?, fame?, fans?, trust?} (once, on purchase),
 *                yearly:  {morale?, fame?, fans?, trust?} (every offseason tick while owned),
 *                text (one line of flavour), icon (an RTG.UI.C icon name), leagues?: ['NFL'] (omit = both) }
 *              Names carry no article: the engine prints "Bought <name>", "<name> upkeep", "Forced sale: <name>".
 * Service    = { id 'PRIVATE_COACH'|'PHYSIO'|'PSYCH', name, price ($k, for one season), text,
 *                effect (one-line summary; the real numbers live in Tuning.finance.services) }
 * Investment = { id, name, kind 'INDEX'|'PROPERTY'|'BUSINESS'|'CRYPTO'|'STARTUP'|'SCAM', risk 'LOW'|'MED'|'HIGH'|'WILD',
 *                weight (pitch odds, Finance.opportunities), leagues?: ['NFL'], minFame?, min, max ($k),
 *                source 'AGENT'|'TEAMMATE'|'BOOSTER'|'BANK'|'DM', pitch (one or two lines in the pitcher's voice),
 *                model: { mean, sd, bust, boom, boomX } }
 *              The yearly model (Finance.tick, one fork per offseason): with prob `bust` the holding goes to 0 for
 *              good; else with prob `boom` it multiplies by `boomX`; else it moves by N(mean, sd), floored at −100 %.
 *              A SCAM busts on its first tick whatever its model says. Holding names carry no article either:
 *              the engine prints "<name> +7 %", "Sold <name>", "{last}'s <name> stake goes to zero".
 *
 * Honest tiers (10,000 simulated ten-year holds, median end value per $1 in): LOW compounds quietly (> ×1.5),
 * MED usually grows but can be wiped out, HIGH is a coin flip with a fat right tail, WILD loses more often than it
 * wins, SCAM is 0. See the notes in test/finance data probes; RTG.Tuning.finance.invest.models are the fallbacks
 * the engine uses when a holding's catalogue entry is gone.
 *
 * Pure data. No randomness, no DOM, JSON round-trippable. No real brands, no real people.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.Data = RTG.Data || {};

  /** Shorthand: buy(id, name, price, upkeep, effects, yearly, icon, text, leagues?) → Purchase. */
  function buy(id, name, price, upkeep, effects, yearly, icon, text, leagues) {
    var p = { id: id, name: name, price: price, upkeep: upkeep, effects: effects || {}, yearly: yearly || {}, icon: icon, text: text };
    if (leagues) p.leagues = leagues;
    return p;
  }
  /** Shorthand: svc(id, name, price, effect, text) → Service. */
  function svc(id, name, price, effect, text) {
    return { id: id, name: name, price: price, effect: effect, text: text };
  }
  /** Shorthand for a return model. */
  function model(mean, sd, bust, boom, boomX) {
    return { mean: mean, sd: sd, bust: bust, boom: boom, boomX: boomX };
  }

  // ───────────────────────────── big buys (lifestyle only: morale / fame / fans / trust) ─────────────────────────────
  // price · upkeep are $k at scale 1; upkeep runs 3–8 % of the price a year (the season tickets simply renew).

  var purchases = [
    buy('USED_TRUCK', 'Used Truck', 25, 2, { morale: 3 }, { morale: 1 }, 'gear',
      'Two hundred thousand miles, one working speaker and a bed full of footballs. Starts on the second try, which is a kind of loyalty.'),
    buy('SPORTS_CAR', 'Sports Car', 90, 7, { morale: 5, fame: 20 }, { fame: 5, trust: -1 }, 'bolt',
      'Low, loud and the colour of a warning. The coach will see it in the players\' lot and say nothing, loudly.'),
    buy('PARENTS_HOUSE', 'Parents\' House', 180, 6, { morale: 8, fans: 4, trust: 2 }, { morale: 2 }, 'home',
      'Paid off, keys handed over at the kitchen table. Mom cries. Dad checks the gutters and says they are "fine, for now".'),
    buy('DOWNTOWN_CONDO', 'Downtown Condo', 120, 8, { morale: 4, fame: 10 }, { morale: 1, fame: 2 }, 'dome',
      'Floor-to-ceiling glass, a gym you will never use and a doorman who calls you "the kicker" to your face.'),
    // BALANCE: price 350 → 500, upkeep 14 → 16 — the fattest college purse over 40 auto careers was $431k (2 of 40 could have bought a $350k lake house on NIL money); $5M in the NFL is 1.7 vet seasons, reachable in every median career
    buy('LAKE_HOUSE', 'Lake House', 500, 16, { morale: 6, fame: 15, fans: 2 }, { morale: 3 }, 'sun',
      'A dock, a screened porch and a lake that is technically a reservoir. Teammates will invite themselves. The good ones bring ice.'),
    buy('BOAT', 'Boat', 60, 5, { morale: 4, fame: 10 }, { morale: 1, fame: 2 }, 'wind',
      'Twin engines, eleven cup holders and a name on the back you will regret by August. The two happiest days of your life, and this is the first one.'),
    buy('SERIOUS_WATCH', 'Serious Watch', 15, 1, { morale: 2, fame: 8 }, { fame: 2 }, 'clock',
      'Heavy, Swiss-adjacent, accurate to a hundredth of a second, which is not a unit the game clock uses.'),
    buy('FOUNDATION', 'Charity Foundation', 50, 10, { morale: 3, fans: 6, trust: 3 }, { fame: 5, fans: 3, trust: 1 }, 'heart',
      'Youth football, a scholarship, a gala with a silent auction. Your name on the door, your money in the pot, and an accountant who calls it "a structure".'),
    buy('KICKING_BARN', 'Kicking Barn', 75, 4, { morale: 5, fame: 5 }, { morale: 2 }, 'boot',
      'Forty yards of turf, real uprights, floodlights and a heater that mostly works. It does not make you better. It makes you happy, which the leg appreciates.'),
    buy('GOLF_CART', 'Custom Golf Cart', 8, 1, { morale: 3, fans: 1 }, { morale: 1 }, 'ball',
      'Lifted, team colours, a sound system louder than the motor. Top speed: a brisk jog. Parking: anywhere, apparently.'),
    buy('SEASON_TICKETS', 'Hometown Season Tickets', 4, 2, { morale: 4, fans: 2 }, { morale: 2, fans: 1 }, 'team',
      'A block of seats at your old high school\'s Friday nights, plus a banner on the fence. Mom sits in them. The banner sits in the wind. Both hold up.')
  ];

  // ───────────────────────────── the three gameplay services (one season; Finance.applyServices) ─────────────────────────────
  // price is $k at scale 1 for the coming season; the effect column is display copy — Tuning.finance.services has the numbers.

  var services = [
    svc('PRIVATE_COACH', 'Private Kicking Coach', 20, 'trainMult ×1.15 + XP',
      'A retired pro with a tripod, a whistle and opinions about your plant foot. Every session filmed, every frame discussed, every Sunday ruined.'),
    svc('PHYSIO', 'Physio On Retainer', 15, 'injury ×0.6',
      'Tape, needles, a table in your living room and a man who says "hm" when he presses on your hip. The hip, it turns out, was the problem.'),
    svc('PSYCH', 'Sports Psychologist', 12, 'pressure ×0.85',
      'Breathing drills, a notebook and a calm voice asking what you think about between the snap and the kick. Turns out: a lot.')
  ];

  // ───────────────────────────── investments (real risk, real loss) ─────────────────────────────
  // min · max are $k at scale 1. weight is the pitch odds among the entries open to the player (league / minFame gates).
  // model: yearly N(mean, sd) with a `bust` chance of going to 0 and a `boom` chance of × boomX (Finance.tick).

  var investments = [
    { id: 'INDEX_FUND', name: 'Index Fund', kind: 'INDEX', risk: 'LOW', weight: 6, min: 5, max: 200, source: 'BANK',
      pitch: 'Low fees, the whole market, forget about it for a decade. Boring is the point. Your grandfather would approve, if he understood what an index was.',
      model: model(0.07, 0.10, 0, 0, 1) },

    { id: 'MUNI_BONDS', name: 'Muni Bonds', kind: 'INDEX', risk: 'LOW', weight: 4, min: 5, max: 200, source: 'BANK',
      pitch: 'The city needs a new water plant and you need somewhere quiet to park money. Tax-free, slow, and nobody has ever bragged about it at a party.',
      model: model(0.05, 0.04, 0, 0, 1) },

    { id: 'RENTAL_DUPLEX', name: 'Rental Duplex', kind: 'PROPERTY', risk: 'MED', weight: 5, min: 40, max: 120, source: 'AGENT',
      pitch: 'Two units, one roof, walking distance from the stadium. The tenants pay the mortgage, you keep the rest. You will get one call a year about a water heater. Answer it.',
      model: model(0.08, 0.18, 0.01, 0.02, 1.8) },

    // BALANCE: max 80 → 120 — the HIGH / WILD caps at NFL scale ($400k–$1M) left an all-in gambler with $6M of cash at retirement; a vet on $2.9M a season can now really lose it
    { id: 'WING_JOINT', name: 'Wing Joint', kind: 'BUSINESS', risk: 'HIGH', weight: 5, min: 20, max: 120, source: 'TEAMMATE',
      pitch: 'Bro. Wings, but elevated. My cousin runs the kitchen, I\'m the face, you\'re the money. Grand opening is in March. Your jersey goes on the wall — the good one.',
      model: model(0.12, 0.35, 0.05, 0.04, 2.5) },

    { id: 'CAR_WASH', name: 'Car Wash Chain', kind: 'BUSINESS', risk: 'MED', weight: 4, min: 30, max: 100, source: 'BOOSTER',
      pitch: 'Four locations, tunnel wash, monthly memberships. People will pay to keep a truck clean in a county with no rain. It\'s not exciting, son. It\'s a printing press with soap.',
      model: model(0.09, 0.22, 0.03, 0.02, 2) },

    // BALANCE: max 60 → 200 (see WING_JOINT); boomX 6 → 8 — the exit multiple is what lets a reckless career finish above a saver at all (8 % of seeds, 6 % over 80; 5 % at ×6)
    // BALANCE (exploit pass): bust 0.25 → 0.30, boom 0.12 → 0.05 — at 0.25 / 0.12 the yearly E[×] was 1.37, the highest in the
    // catalogue, and an all-WILD career beat cash in 20 of 30 seeds; every WILD model now has E[×] < 1 (finance.test.js pins it)
    { id: 'PARKING_APP', name: 'Parking App', kind: 'STARTUP', risk: 'WILD', weight: 3, min: 10, max: 200, source: 'BOOSTER',
      pitch: 'Kid, this is the one. An app that tells you where to park at the game before you leave the house. Two engineers, a pitch deck and my nephew. Ground floor. I\'m in for six figures myself, mostly.',
      model: model(0.0, 0.6, 0.30, 0.05, 8) },

    // BALANCE: max 100 → 300 (see WING_JOINT) — $3M into a coin is the second-contract punt the pitch is begging for
    // BALANCE (exploit pass): mean 0.15 → 0.0, bust 0.12 → 0.20 — yearly E[×] 1.18 → 0.97 (see PARKING_APP)
    { id: 'ROCKET_COIN', name: 'Rocket Coin', kind: 'CRYPTO', risk: 'WILD', weight: 4, min: 5, max: 300, source: 'DM',
      pitch: 'not financial advice but the coin is going parabolic and the devs are ex-military (allegedly). up 300% since june. dont be the guy who watched from the sideline. link in bio',
      model: model(0.0, 0.8, 0.20, 0.06, 4) },

    // BALANCE: max 40 → 80 (see WING_JOINT)
    { id: 'MEMORABILIA', name: 'Memorabilia Stash', kind: 'BUSINESS', risk: 'HIGH', weight: 3, min: 5, max: 80, source: 'TEAMMATE',
      pitch: 'Game balls, signed cards, a helmet from the title run. I buy low from guys who need cash and sell high to guys who have it. Cards are the new gold, bro. Don\'t look that up.',
      model: model(0.10, 0.40, 0.04, 0.05, 3) },

    { id: 'SMOOTHIE_FRANCHISE', name: 'Smoothie Franchise', kind: 'BUSINESS', risk: 'HIGH', weight: 3, min: 60, max: 200, source: 'AGENT',
      pitch: 'Three units, corporate does the recipes, you do the ribbon cutting. I have two other clients in it and one of them still talks to me.',
      model: model(0.10, 0.30, 0.05, 0.03, 2.5) },

    // the "sure thing": the pitch has every tell (guaranteed monthly returns, a deadline, secrecy) and never says so
    // BALANCE: weight 2 → 1 — at 2 the scam was pitched in 14 % of offseasons and 90 % of careers met it; at 1 it is 6–7 % of offseasons, about two thirds of careers see it once
    { id: 'SURE_THING', name: 'Sure Thing Fund', kind: 'SCAM', risk: 'WILD', weight: 1, min: 10, max: 50, source: 'DM',
      pitch: 'Hey man, huge fan. Quick one — my guy runs a private fund doing 4 % a month, guaranteed, six years running, very low-key. He\'s opening two more spots and I thought of you first. Wire by Friday and keep it between us; agents just want a cut.',
      model: model(0, 0, 1, 0, 1) },

    { id: 'HOMETOWN_GYM', name: 'Hometown Gym', kind: 'BUSINESS', risk: 'MED', weight: 4, min: 20, max: 80, source: 'TEAMMATE',
      pitch: 'Your old long snapper here. Buying the gym on Route 9 — the one with the good squat rack and the bad carpet. New floors, your name on the wall, half the town on a membership. Come home and lift.',
      model: model(0.08, 0.20, 0.03, 0.02, 2) },

    { id: 'BUYOUT_FUND', name: 'Buyout Fund', kind: 'BUSINESS', risk: 'MED', weight: 4, leagues: ['NFL'], minFame: 200, min: 100, max: 500, source: 'BANK',
      pitch: 'Our private-client desk holds a seat in a buyout fund for athletes — quiet companies, a long horizon, quarterly letters you will not read. The minimum is meaningful. Historically, so are the returns.',
      model: model(0.11, 0.20, 0.03, 0.03, 2) }
  ];

  function index(list) {
    var out = {};
    for (var i = 0; i < list.length; i++) out[list[i].id] = list[i];
    return out;
  }

  RTG.Data.finance = {
    purchases: purchases,
    services: services,
    investments: investments,
    purchasesById: index(purchases),
    servicesById: index(services),
    investmentsById: index(investments)
  };
})(typeof window !== 'undefined' ? window : globalThis);
