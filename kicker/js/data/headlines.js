/**
 * Road to Glory: Kicker — headline templates & inbox message templates (SPEC §2.11).
 *
 * RTG.Data.headlines : [{id, tags:[...], w?, cond?:fn(ctx)→bool, text}]   (≥ 160)
 *   Slots: {name} {first} {last} {team} {nick} {opp} {city} {dist} {pct} {coach} {rival} {week}
 *          {score} {year} {age} {agent} {line} {n} {award} {money} {years} {round} {pick}
 *   cond receives the render ctx: the caller's vars merged with state facts
 *          {league, stage, phase, year, week, age, clu, fame, fans, trust, role, nflSeasons, collegeSeasons,
 *           weather, dist, made, iced, playoff, rivalry, snow, rookie, walkon}
 * RTG.Data.messages  : {[kind]: [{id, from, avatar?, text}]}   (≥ 60 templates)
 *   kinds: coach_form_sharp coach_form_watch coach_js_high coach_js_low coach_hot_seat coach_bench coach_unbench
 *          coach_win coach_loss coach_pregame coach_camp coach_rest
 *          agent_final_year agent_extension agent_fa agent_tag agent_rookie agent_market agent_cut
 *          gm_welcome gm_cut_warning gm_trade gm_release
 *          press_request press_slump press_hot press_draft
 *          fan_love fan_hate fan_kid  family_proud family_worry family_home  result_win result_loss
 *
 * Tone: mean-but-fun. The news never lets you forget last week. Pure data.
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.Data = RTG.Data || {};

  /** Shorthand: h(id, tags, text, opts) → template. */
  function h(id, tags, text, opts) {
    var t = { id: id, tags: typeof tags === 'string' ? [tags] : tags, text: text };
    if (opts) {
      if (opts.w !== undefined) t.w = opts.w;
      if (opts.cond) t.cond = opts.cond;
    }
    return t;
  }
  var isNfl = function (c) { return c.league === 'NFL'; };
  var isCollege = function (c) { return c.league !== 'NFL'; };
  var isRookie = function (c) { return !!c.rookie; };
  var isSnow = function (c) { return c.weather === 'snow' || !!c.snow; };
  var isRain = function (c) { return c.weather === 'rain'; };
  var isPlayoff = function (c) { return !!c.playoff; };
  var isRivalry = function (c) { return !!c.rivalry; };
  var isIced = function (c) { return !!c.iced; };
  var isLong = function (c) { return Number(c.dist) >= 50; };
  var isShort = function (c) { return Number(c.dist) > 0 && Number(c.dist) < 35; };
  var isOld = function (c) { return Number(c.age) >= 34; };
  var isWindy = function (c) { return Number(c.windSpeed) >= 15; };

  var headlines = [
    // ── postgame_win (13)
    h('pw1', 'postgame_win', '{team} hold on; {last} quietly {line} while everyone else took the credit'),
    h('pw2', 'postgame_win', 'W FOR {city}: {last} {line}, offense "did the rest", says offense'),
    h('pw3', 'postgame_win', '{team} beat {opp}; kicker {last} "did his job", which is the nicest thing anyone says about kickers'),
    h('pw4', 'postgame_win', 'LEG UP: {last} {line} as {team} handle {opp} {score}'),
    h('pw5', 'postgame_win', '{team} win {score}; {coach} "pleased", which for him is a facial spasm'),
    h('pw6', 'postgame_win', '{last} {line} in the win; the holder would like some credit, receives none'),
    h('pw7', 'postgame_win', 'Business as usual: {team} top {opp}, {last} does the boring good thing again'),
    h('pw8', 'postgame_win', '{team} roll past {opp}; {last} spent the fourth quarter "stretching for no reason"'),
    h('pw9', 'postgame_win', 'FRESHMAN FOOT: {last} {line} as {team} win on the road', { cond: isCollege }),
    h('pw10', 'postgame_win', 'Rookie {last} {line}; veterans "starting to learn his name"', { cond: isRookie }),
    h('pw11', 'postgame_win', 'Snow globe win: {team} beat {opp} in the flurries, {last} {line}', { cond: isSnow }),
    h('pw12', 'postgame_win', 'Soggy but sturdy: {last} {line} in the rain as {team} win', { cond: isRain }),
    h('pw13', 'postgame_win', 'PLAYOFF LEG: {last} {line} as {team} survive and advance', { cond: isPlayoff }),
    h('pw14', 'postgame_win', 'RIVALRY WEEK BELONGS TO {city}: {team} beat {rival}, {last} {line}', { cond: isRivalry }),

    // ── postgame_loss (13)
    h('pl1', 'postgame_loss', '{team} fall to {opp} {score}; {last} {line}, which nobody will remember'),
    h('pl2', 'postgame_loss', 'L IN {city}: {last} {line} in a game the defense lost by itself, mostly'),
    h('pl3', 'postgame_loss', '{opp} beat {team}; fans blame the kicker on principle'),
    h('pl4', 'postgame_loss', 'Another one gets away: {team} drop {score} decision to {opp}'),
    h('pl5', 'postgame_loss', '{coach} after the loss: "We\'ll look at the tape." The tape is not going to like it'),
    h('pl6', 'postgame_loss', '{last} {line} in defeat; talk radio "not interested in the percentages"'),
    h('pl7', 'postgame_loss', 'LONG BUS RIDE: {team} lose at {opp}, {last} "sat in the back, ate a pretzel"'),
    h('pl8', 'postgame_loss', 'Points left on the field as {team} fall to {opp}; some of them were {last}\'s'),
    h('pl9', 'postgame_loss', '{team} lose in the snow; {last} {line} with frozen toes and a warm excuse', { cond: isSnow }),
    h('pl10', 'postgame_loss', 'Rookie {last} learns a lesson about losing; lesson: it stinks', { cond: isRookie }),
    h('pl11', 'postgame_loss', 'SEASON OVER: {team} bounced from the playoffs by {opp}; {last} {line}', { cond: isPlayoff }),
    h('pl12', 'postgame_loss', '{rival} take rivalry week; {city} enters a period of mourning and grilling', { cond: isRivalry }),
    h('pl13', 'postgame_loss', 'Ugly one for {team}: {opp} win {score}, everybody looks bad, kicker looks least bad'),

    // ── game_winner (11)
    h('gw1', 'game_winner', 'ICE COLD: {last} drills {dist}-yarder as time expires, {team} beat {opp}'),
    h('gw2', 'game_winner', 'GAME. WINNER. {last} from {dist}. {city} loses its collective mind'),
    h('gw3', 'game_winner', 'THE LEG IS LAW: {last} nails walk-off {dist}-yarder, {opp} kicker "seen sighing"'),
    h('gw4', 'game_winner', 'Ball games: {last}\'s {dist}-yard game-winner sends {team} home happy'),
    h('gw5', 'game_winner', '{opp} tried to ice him. {last} thawed them from {dist}', { cond: isIced }),
    h('gw6', 'game_winner', 'LONG BALL, LONG NIGHT FOR {opp}: {last} wins it from {dist}', { cond: isLong }),
    h('gw7', 'game_winner', 'Chip shot, giant moment: {last}\'s {dist}-yarder beats {opp}', { cond: isShort }),
    h('gw8', 'game_winner', 'WALK-OFF IN THE SNOW: {last} splits the uprights through the flakes', { cond: isSnow }),
    h('gw9', 'game_winner', 'PLAYOFF DAGGER: {last}\'s {dist}-yarder sends {team} through and {opp} home', { cond: isPlayoff }),
    h('gw10', 'game_winner', 'BRAGGING RIGHTS: {last} beats {rival} at the gun from {dist}', { cond: isRivalry }),
    h('gw11', 'game_winner', 'Rookie {last} wins it from {dist}; veterans "may let him talk now"', { cond: isRookie }),

    // ── decisive_miss (11)
    h('dm1', 'decisive_miss', 'WIDE. {last} misses from {dist} with the game on his foot; {team} lose to {opp}'),
    h('dm2', 'decisive_miss', 'NO GOOD: {last}\'s {dist}-yard try sails, {city} sails with it'),
    h('dm3', 'decisive_miss', 'The kick that got away: {last} misses game-winner from {dist}'),
    h('dm4', 'decisive_miss', '{team} fall as {last} hooks {dist}-yarder; "I\'ll see it in my sleep," he says'),
    h('dm5', 'decisive_miss', 'ICED AND DICED: timeout works, {last} misses from {dist}', { cond: isIced }),
    h('dm6', 'decisive_miss', 'Asked to win it from {dist}, {last} does not; {coach} "would do it again", lying', { cond: isLong }),
    h('dm7', 'decisive_miss', 'SHORT AND SOUR: {last} misses from {dist}, a distance children make in yards', { cond: isShort }),
    h('dm8', 'decisive_miss', 'SEASON ENDS ON A MISS: {last} from {dist}, {opp} advance, {city} silent', { cond: isPlayoff }),
    h('dm9', 'decisive_miss', 'Rivalry heartbreak: {last} misses to beat {rival}; students already making signs', { cond: isRivalry }),
    h('dm10', 'decisive_miss', 'Rookie {last} misses the big one; veteran kicker on {opp} "remembers his first"', { cond: isRookie }),
    h('dm11', 'decisive_miss', '{team} lose on a missed {dist}-yarder; {last}\'s phone "currently off, forever"'),

    // ── doink (9)
    h('dk1', 'doink', 'DOINK. The post says no to {last} from {dist}'),
    h('dk2', 'doink', 'TING HEARD ROUND {city}: {last} bangs {dist}-yarder off the upright'),
    h('dk3', 'doink', 'The uprights, 1; {last}, 0. {team} kicker doinks from {dist}'),
    h('dk4', 'doink', 'Post pattern: {last} hits iron from {dist}, crowd makes a noise like a sad kettle'),
    h('dk5', 'doink', 'DOINK... AND IN! {last}\'s {dist}-yarder bounces off the post and through. Physics apologises', { cond: function (c) { return !!c.made; } }),
    h('dk6', 'doink', 'Off the crossbar and good: {last} gets a {dist}-yard gift from geometry', { cond: function (c) { return !!c.made && !!c.crossbar; } }),
    h('dk7', 'doink', 'Upright says nope: {last} doinks from {dist}, holder "did everything right"', { cond: function (c) { return !c.made; } }),
    h('dk8', 'doink', 'A METALLIC SOUND, THEN SILENCE: {last} from {dist}, off the post', { cond: function (c) { return !c.made; } }),
    h('dk9', 'doink', 'DOINK KING STRIKES AGAIN: {last} finds the post from {dist}', { cond: function (c) { return !!c.doinkKing; } }),

    // ── blocked (8)
    h('bl1', 'blocked', 'BLOCKED! {opp} get a hand on {last}\'s {dist}-yarder; line "will review the film, allegedly"'),
    h('bl2', 'blocked', 'Swatted: {last}\'s {dist}-yard try blocked; {coach} blames protection, then kicker, then weather'),
    h('bl3', 'blocked', 'Low and slow: {last} gets a {dist}-yarder blocked, {opp} celebrate like they won the lottery'),
    h('bl4', 'blocked', 'Big paw, no points: {opp} block {last} from {dist}'),
    h('bl5', 'blocked', 'BLOCKED AND RETURNED: {opp} take {last}\'s kick the other way; stadium exits crowded', { cond: function (c) { return !!c.returnTd; } }),
    h('bl6', 'blocked', 'Kick blocked at the line; {last} "got it up fine", says {last}'),
    h('bl7', 'blocked', 'PAT blocked, two points the other way: the worst kind of arithmetic for {team}', { cond: function (c) { return c.type === 'PAT'; } }),
    h('bl8', 'blocked', '{opp} block {last}; long snapper and holder "both pointing at the other one"'),

    // ── shank (8)
    h('sh1', 'shank', 'SHANK. {last}\'s {dist}-yarder heads for the parking lot'),
    h('sh2', 'shank', 'Where did that go? {last} skews one badly from {dist}; ball "found later"'),
    h('sh3', 'shank', 'Wide by a mile: {last}\'s {dist}-yard attempt misses the stadium, nearly'),
    h('sh4', 'shank', 'The duck: {last} shanks a {dist}-yarder that a goose would disown'),
    h('sh5', 'shank', '{last} misses from {dist} by a margin usually reserved for punts'),
    h('sh6', 'shank', 'Yikes: {last} shanks in the rain, blames the rain, rain declines comment', { cond: isRain }),
    h('sh7', 'shank', 'Wind takes the blame for {last}\'s shank; wind was not that strong', { cond: isWindy }),
    h('sh8', 'shank', 'Contact issue: {last} hits the ball with "a part of the foot science has not named"'),

    // ── fifty_plus (9)
    h('fp1', 'fifty_plus', 'BIG LEG: {last} bombs one from {dist}'),
    h('fp2', 'fifty_plus', 'From {dist}? Sure. {last} makes it look like a PAT'),
    h('fp3', 'fifty_plus', 'DISTANCE IS A MYTH: {last} connects from {dist}, {opp} sideline "impressed, annoyed"'),
    h('fp4', 'fifty_plus', '{dist} yards of pure nerve: {last} splits them from way downtown'),
    h('fp5', 'fifty_plus', 'CAREER LONG: {last} sets a personal best from {dist}', { cond: function (c) { return !!c.careerLong; } }),
    h('fp6', 'fifty_plus', 'SIXTY. {last} makes a {dist}-yarder and the stadium forgets to breathe', { cond: function (c) { return Number(c.dist) >= 60; } }),
    h('fp7', 'fifty_plus', 'Long ball in the snow: {last} from {dist} through the flurries', { cond: isSnow }),
    h('fp8', 'fifty_plus', 'Into the wind from {dist}: {last} "aimed at the hot dog stand"', { cond: isWindy }),
    h('fp9', 'fifty_plus', 'Freshman leg goes {dist}: {last} announces himself', { cond: isCollege }),

    // ── perfect_day (9)
    h('pd1', 'perfect_day', 'PERFECT: {last} goes {line}; nobody notices, which is the point'),
    h('pd2', 'perfect_day', '{last} {line}, a clean sheet; holder demands his share of the attention'),
    h('pd3', 'perfect_day', 'Automatic: {last} {line} against {opp}, coaches "didn\'t look up once"'),
    h('pd4', 'perfect_day', 'No misses, no drama, no interviews: a perfect day for {last}'),
    h('pd5', 'perfect_day', 'CLEAN AS A WHISTLE: {last} {line} in the win over {opp}'),
    h('pd6', 'perfect_day', 'Every kick, every time: {last} spotless as {team} beat {opp}'),
    h('pd7', 'perfect_day', 'Perfect in the snow: {last} {line} while linemen slip and slide', { cond: isSnow }),
    h('pd8', 'perfect_day', 'Rookie {last} perfect against {opp}; "he\'s fine", says the vet who wanted the job', { cond: isRookie }),
    h('pd9', 'perfect_day', 'Money leg: {last} {line}, {coach} "might let him attempt something interesting soon"'),

    // ── bad_day (11)
    h('bd1', 'bad_day', 'LEG OF GOLD OR LEG OF LEAD? {last} goes {line} in a rough one'),
    h('bd2', 'bad_day', 'Off day: {last} {line}; fans in {city} "need a minute"'),
    h('bd3', 'bad_day', '{last} {line}; {coach} asked whether he\'s worried, answers "next question"'),
    h('bd4', 'bad_day', 'Rough afternoon: {last} {line} against {opp}, uprights "did nothing wrong"'),
    h('bd5', 'bad_day', 'The yips? {last} {line} and the whispers begin'),
    h('bd6', 'bad_day', 'ONE-FOR-FOUR IN THE RAIN: {last} kicks like the ball owes him money', { cond: isRain }),
    h('bd7', 'bad_day', 'Snow day, no day: {last} {line} in the blizzard', { cond: isSnow }),
    h('bd8', 'bad_day', 'Rookie wall: {last} {line}, veterans "stop learning his name"', { cond: isRookie }),
    h('bd9', 'bad_day', '{last} {line}; talk radio host says he "kicks like he\'s wearing skis"'),
    h('bd10', 'bad_day', 'Trouble at the kicker position: {last} {line}, the backup "warming up loudly"'),
    h('bd11', 'bad_day', 'Long day for a long leg: {last} {line}, {team} survive anyway'),

    // ── slump (8)
    h('sl1', 'slump', 'SLUMP WATCH: {last} has missed in three straight; {coach} "monitoring the situation"'),
    h('sl2', 'slump', 'Something\'s off with {last}; plant foot, head, or just vibes?'),
    h('sl3', 'slump', 'Kicking coach spotted at {team} practice; {last} "totally fine, why"'),
    h('sl4', 'slump', 'The ball is not going where {last} is looking; sources: "he is looking at the goalposts"'),
    h('sl5', 'slump', 'Confidence crisis in {city}? {last} at {pct} on the year and falling'),
    h('sl6', 'slump', '{last} declines interview requests for the third week; his agent "also declining"'),
    h('sl7', 'slump', 'Is the walk-on ready? {coach} asked; {coach} says "I like our guys", plural'),
    h('sl8', 'slump', 'HOT SEAT: {last}\'s job "not safe, not unsafe, warm" per team source'),

    // ── hot_streak (8)
    h('hs1', 'hot_streak', 'CAN\'T MISS: {last} has made {n} straight; opponents "considering not kicking off to him", confused'),
    h('hs2', 'hot_streak', 'Streak alive: {last} at {n} in a row, {coach} "not superstitious, don\'t touch him"'),
    h('hs3', 'hot_streak', '{n} STRAIGHT: {last} is a metronome with cleats'),
    h('hs4', 'hot_streak', 'Automatic in {city}: {last} extends streak to {n}, fans start saying "Automatic" a lot'),
    h('hs5', 'hot_streak', 'THE LEG IS HOT: {last} {n} for his last {n}, and the holder still gets no credit'),
    h('hs6', 'hot_streak', '{last}\'s {n}-kick streak has the whole town not talking about it, loudly'),
    h('hs7', 'hot_streak', 'Kicker of the month? {last} rolling with {n} straight and a {pct} season'),
    h('hs8', 'hot_streak', 'Local kids now "kicking everything" as {last}\'s streak hits {n}'),

    // ── award (9)
    h('aw1', 'award', 'HARDWARE: {last} wins the {award}'),
    h('aw2', 'award', '{last} named {award}; the punter "happy for him, in a way"'),
    h('aw3', 'award', 'TROPHY CASE GETS HEAVIER: {last} takes the {award}'),
    h('aw4', 'award', '{city} celebrates as {last} lands the {award}; parade "unlikely but discussed"'),
    h('aw5', 'award', 'Kicker wins something! {last} honored with the {award}'),
    h('aw6', 'award', 'The voters got one right: {last}, {award}'),
    h('aw7', 'award', 'ALL-STAR LEG: {last} earns {award} honors', { cond: isNfl }),
    h('aw8', 'award', 'College football notices a kicker: {last} wins the {award}', { cond: isCollege }),
    h('aw9', 'award', 'A punter won it: {last} snubbed for STPOY despite a season "for the ages", says his mom', { cond: function (c) { return !!c.snub; } }),

    // ── contract (9)
    h('ct1', 'contract', 'PAID: {last} signs {years}-year, {money} deal with {team}'),
    h('ct2', 'contract', '{team} lock up {last} through {years} more years; GM "loves the leg"'),
    h('ct3', 'contract', 'NEW DEAL: {last} gets {money} a year to kick a ball; {last} "will kick the ball"'),
    h('ct4', 'contract', 'Extension in {city}: {last} and {team} agree to {years} years'),
    h('ct5', 'contract', 'TAGGED: {team} franchise-tag kicker {last}; kicker "thrilled", grimacing', { cond: function (c) { return !!c.tag; } }),
    h('ct6', 'contract', 'Holdout over: {last} reports after {team} sweeten the pot', { cond: function (c) { return !!c.holdout; } }),
    h('ct7', 'contract', 'Hometown discount: {last} takes less to stay in {city}; agent "physically ill"', { cond: function (c) { return !!c.discount; } }),
    h('ct8', 'contract', 'VET MINIMUM: {last} signs for scraps to keep kicking; "scraps kick too", he says', { cond: function (c) { return !!c.min; } }),
    h('ct9', 'contract', '{last} inks {years}-year deal; fine print includes "no more billboard shoots"'),

    // ── draft (9)
    h('dr1', 'draft', 'DRAFTED: {team} select {last} in round {round}, pick {pick}; room goes quiet then polite'),
    h('dr2', 'draft', 'A kicker in round {round}! {team} take {last}; analysts "have questions"'),
    h('dr3', 'draft', '{last} hears his name in round {round}; mom "cried, obviously"'),
    h('dr4', 'draft', 'SHOCK PICK: {team} take kicker {last} in the FIRST ROUND; draft room "openly laughing, then not"', { cond: function (c) { return Number(c.round) === 1; } }),
    h('dr5', 'draft', 'Late-round leg: {team} grab {last} in round {round}; "value pick", says a man with a spreadsheet', { cond: function (c) { return Number(c.round) >= 6; } }),
    h('dr6', 'draft', 'UNDRAFTED: {last} watches 257 names go by, none his; phone "should ring soon"', { cond: function (c) { return !!c.undrafted; } }),
    h('dr7', 'draft', 'Combine buzz: {last} nails the {dist} at pro day, scouts "adjust pencil"', { cond: function (c) { return !!c.combine; } }),
    h('dr8', 'draft', 'DECLARED: {last} leaves {team} for the draft; campus "loses a leg, keeps the memories"', { cond: function (c) { return !!c.declared; } }),
    h('dr9', 'draft', '{last} heads to {team} as a round-{round} pick; incumbent kicker "updating LinkedIn"'),

    // ── fa (7)
    h('fa1', 'fa', 'FREE AGENT LEG: {last} hits the market; {n} teams "interested", 30 teams "not"'),
    h('fa2', 'fa', '{last} signs with {team} in free agency; {city} gets a new kicker and a new excuse'),
    h('fa3', 'fa', 'DONE DEAL: {last} to {team} for {years} years, {money} per'),
    h('fa4', 'fa', 'Waiting game: {last} still unsigned; agent says "market is developing", which means it is not'),
    h('fa5', 'fa', 'New town, same leg: {last} lands in {city}'),
    h('fa6', 'fa', 'Practice squad life: {last} signs on to wait for a phone call', { cond: function (c) { return !!c.practiceSquad; } }),
    h('fa7', 'fa', 'HOMECOMING: {last} signs with hometown-adjacent {team}; family "renting a bus"', { cond: function (c) { return !!c.hometown; } }),

    // ── cut (7)
    h('cu1', 'cut', 'RELEASED: {team} cut kicker {last}; team "thanks him for his contributions", vaguely'),
    h('cu2', 'cut', '{last} out in {city}; GM cites "a numbers thing", the numbers being his kicks'),
    h('cu3', 'cut', 'Dead money: {team} eat {money} to move on from {last}'),
    h('cu4', 'cut', 'Cut day claims {last}; the walk-on is now the starter and terrified'),
    h('cu5', 'cut', 'BENCHED: {last} loses the job; {coach} says "we\'re rotating", which is not a thing'),
    h('cu6', 'cut', '{team} go with the other guy; {last} "will keep kicking, somewhere, at something"'),
    h('cu7', 'cut', 'College kicker {last} loses starting role for the season; kickoffs only, "the sad duty"', { cond: isCollege }),

    // ── injury (8)
    h('in1', 'injury', 'INJURY: {last} out {n} weeks with a {injury}; backup "reading the rulebook"'),
    h('in2', 'injury', '{last} hurt in practice; {coach} "it\'s the leg" — reporters: "which leg" — {coach}: "the one"'),
    h('in3', 'injury', '{team} lose {last} for {n} weeks; kickers around the league "wince in solidarity"'),
    h('in4', 'injury', 'Plant foot trouble sidelines {last}; timeline "weeks, not days, not months, weeks"'),
    h('in5', 'injury', 'CAREER-THREATENING: {last} faces long road back after {injury}', { cond: function (c) { return !!c.careerThreat; } }),
    h('in6', 'injury', 'COMEBACK: {last} returns from injury; leg "80 percent", confidence "110 percent, allegedly"', { cond: function (c) { return !!c.returned; } }),
    h('in7', 'injury', 'Old leg, new strain: {last} ({age}) out {n} weeks', { cond: isOld }),
    h('in8', 'injury', 'Kicker down: {last} out with {injury}, punter to handle kicks, everyone nervous'),

    // ── event_consequence (10) — fallbacks when an event has no explicit headline
    h('ec1', 'event_consequence', 'Off-field news: {last} makes a decision about "{title}"; results pending'),
    h('ec2', 'event_consequence', '{last} chooses "{choice}" and the {city} press has opinions'),
    h('ec3', 'event_consequence', 'Sources: {last} went with "{choice}". Sources: "we\'ll see"'),
    h('ec4', 'event_consequence', 'Kicker news that isn\'t about kicking: {last} and the matter of "{title}"'),
    h('ec5', 'event_consequence', '{team} kicker {last} responds to "{title}" with "{choice}"; locker room shrugs'),
    h('ec6', 'event_consequence', 'Week in the life: {last} deals with "{title}", picks "{choice}"'),
    h('ec7', 'event_consequence', 'Not a kick, still a headline: {last} on "{title}"'),
    h('ec8', 'event_consequence', '{coach} on {last}\'s handling of "{title}": "That\'s his business. Kick the ball."'),
    h('ec9', 'event_consequence', 'The saga of "{title}" ends with {last} choosing "{choice}". Nobody is satisfied'),
    h('ec10', 'event_consequence', '{city} reacts to {last}\'s "{choice}" with a mix of shrugs and hot takes'),

    // ── weekly_flavor (24)
    h('wf1', 'weekly_flavor', 'Week {week}: {team} prepare for {opp}; kicker {last} "prepared last week too"'),
    h('wf2', 'weekly_flavor', '{coach} on this week\'s plan: "Score more points than them." Bold'),
    h('wf3', 'weekly_flavor', 'Injury report: everyone but the kicker; kicker "feels great, thanks for asking"'),
    h('wf4', 'weekly_flavor', 'Weather watch for {city}: wind "possible", which in football means "certain"'),
    h('wf5', 'weekly_flavor', 'Practice notes: {last} made "a lot" of kicks, per a scout who counted "most of them"'),
    h('wf6', 'weekly_flavor', 'The punter and the kicker had lunch; witnesses report "no talking, some nodding"'),
    h('wf7', 'weekly_flavor', '{opp} kicker says he "respects" {last}, which in kicker terms is a declaration of war'),
    h('wf8', 'weekly_flavor', 'Local diner names a sandwich after {last}; it is a small sandwich'),
    h('wf9', 'weekly_flavor', 'Kicking coach spotted at practice; team insists "routine", kicker insists "very routine"'),
    h('wf10', 'weekly_flavor', 'Rankings out: {team} "somewhere", per a poll voted on by tired men', { cond: isCollege }),
    h('wf11', 'weekly_flavor', 'Power rankings: {team} move up, down, or sideways depending on the website', { cond: isNfl }),
    h('wf12', 'weekly_flavor', 'Bye week for {team}; {last} "kicked anyway, at nothing, for hours"'),
    h('wf13', 'weekly_flavor', 'Film study: {last} watched {opp}\'s block unit and "did not enjoy it"'),
    h('wf14', 'weekly_flavor', '{city} radio spends 40 minutes on the kicker; all 40 minutes were about one kick'),
    h('wf15', 'weekly_flavor', 'Special teams meeting runs long; sources say "someone brought a laser pointer"'),
    h('wf16', 'weekly_flavor', 'Fan poll: 61 percent "trust the kicker", 39 percent "have met the kicker"'),
    h('wf17', 'weekly_flavor', 'The long snapper got a haircut and the whole operation feels different'),
    h('wf18', 'weekly_flavor', 'Cold snap hits {city}; {last} practices in shorts "to make a point"', { cond: function (c) { return c.weather === 'snow' || c.weather === 'cold'; } }),
    h('wf19', 'weekly_flavor', 'Heat advisory in {city}; kicker "fine", lineman "melting"'),
    h('wf20', 'weekly_flavor', 'Midterms week: {last} "kicking and cramming", GPA "also a percentage"', { cond: isCollege }),
    h('wf21', 'weekly_flavor', 'Contract year for {last}; every kick "worth roughly a boat", per agent', { cond: function (c) { return !!c.contractYear; } }),
    h('wf22', 'weekly_flavor', 'Veteran {last} ({age}) says the leg "feels 25", the knee "feels 50"', { cond: isOld }),
    h('wf23', 'weekly_flavor', 'Rookie {last} still asking where the meeting rooms are; teammates giving wrong directions', { cond: isRookie }),
    h('wf24', 'weekly_flavor', 'Holder drama update: there is no holder drama, which is itself suspicious'),

    // ── rare (9)
    h('ra1', 'rare', 'PERFECT SEASON: {last} did not miss. Not once. Statisticians "checking for a glitch"', { cond: function (c) { return !!c.perfectSeason; } }),
    h('ra2', 'rare', '0-FOR-3: {last} misses everything he looks at; {coach} "looking at other things"', { cond: function (c) { return !!c.zeroForThree; } }),
    h('ra3', 'rare', 'SIXTY IN THE SNOW: {last} makes a {dist}-yarder in a blizzard; meteorologists "impressed"', { cond: function (c) { return isSnow(c) && Number(c.dist) >= 60; } }),
    h('ra4', 'rare', 'ICE DOES NOTHING TO THIS MAN: {last} iced, laughed, kicked, made it', { cond: function (c) { return !!c.iced && !!c.made && Number(c.clu) >= 90; } }),
    h('ra5', 'rare', 'A KICKER JUST WON A TITLE: {last}\'s {dist}-yarder wins the championship', { cond: function (c) { return !!c.champ; } }),
    h('ra6', 'rare', 'BLOCKED, RETURNED, AND BEATEN: the worst 8 seconds of {last}\'s life', { cond: function (c) { return !!c.returnTd && !!c.decisive; } }),
    h('ra7', 'rare', 'RECORD: {last} breaks the {record} record; old holder {holder} "had a good run"', { cond: function (c) { return !!c.record; } }),
    h('ra8', 'rare', 'FIRST-ROUND KICKER: {team} shock the world; {last} shocked most', { cond: function (c) { return !!c.shock; } }),
    h('ra9', 'rare', 'THE DOINK DOUBLE: {last} hits both uprights on the same kick, somehow good', { cond: function (c) { return !!c.doubleDoink; } }),

    // ── milestone (6)
    h('ms1', 'milestone', 'MILESTONE: {last} reaches {n} career field goals; cake "not provided"'),
    h('ms2', 'milestone', '{n} career points for {last}, all three or one at a time'),
    h('ms3', 'milestone', 'First 50-plus for {last}: the leg has arrived, and it lives here now', { cond: function (c) { return c.milestone === 'first50'; } }),
    h('ms4', 'milestone', 'FIRST 60-YARDER: {last} joins a club with no clubhouse', { cond: function (c) { return c.milestone === 'first60'; } }),
    h('ms5', 'milestone', '{n} straight makes for {last}; the streak has its own social media account'),
    h('ms6', 'milestone', 'Ten game-winners: {last} is now legally "clutch", per a court in {city}', { cond: function (c) { return c.milestone === 'gw10'; } }),

    // ── transfer / trade / bench / retire (14)
    h('tr1', 'transfer', 'PORTAL: {last} transfers to {team}; old school "wishes him well", sarcastically'),
    h('tr2', 'transfer', '{last} lands at {team} after portal stint; new {coach} "excited", old coach "relieved"'),
    h('tr3', 'transfer', 'Fresh start: {last} arrives in {city} with a duffel bag and a 46-yard range'),
    h('td1', 'trade', 'TRADED: {last} shipped to {team}; {city} fans "learning a new kicker\'s name"'),
    h('td2', 'trade', '{team} acquire kicker {last} for a late pick and "considerations"'),
    h('td3', 'trade', 'Trade request denied: {last} staying put, "for now", says everybody'),
    h('td4', 'trade', 'A sixth-rounder for a leg: {last} joins contender {team}'),
    h('be1', 'bench', 'BENCHED: {last} loses kicking job to the backup; "healthy competition", per {coach}'),
    h('be2', 'bench', '{last} back to K1 after backup "made him look good by comparison"', { cond: function (c) { return !!c.restored; } }),
    h('be3', 'bench', 'CAMP BATTLE: {last} vs the other guy, six kicks, winner starts, loser sulks', { cond: function (c) { return !!c.camp; } }),
    h('be4', 'bench', '{last} WINS THE JOB: camp battle goes to the veteran, backup "already packing"', { cond: function (c) { return !!c.won; } }),
    h('re1', 'retire', 'RETIRED: {last} hangs up the boot after {n} seasons; the boot "relieved"'),
    h('re2', 'retire', 'FAREWELL: {last} kicks his last as {team} say goodbye to a {n}-year leg'),
    h('re3', 'retire', 'Hall call: {last} elected to the Hall of Fame; punters "still waiting"', { cond: function (c) { return !!c.hof; } }),
    h('re4', 'retire', 'The debate rages on: {last} falls short of the Hall, again; his mom "writing letters"', { cond: function (c) { return !!c.finalist; } })
  ];

  // ───────────────────────────── inbox messages ─────────────────────────────

  function m(kind, id, from, text) { return { id: id, kind: kind, from: from, avatar: from, text: text }; }
  var messages = {
    coach_form_sharp: [
      m('coach_form_sharp', 'cfs1', 'coach', "You've looked sharp in practice. Don't tell anyone I said that."),
      m('coach_form_sharp', 'cfs2', 'coach', "Saw the plant foot today. Textbook. Keep doing the boring thing."),
      m('coach_form_sharp', 'cfs3', 'coach', "Whatever you're eating, keep eating it. Leg looks live.")
    ],
    coach_form_watch: [
      m('coach_form_watch', 'cfw1', 'coach', "I'm watching your plant foot. It's wandering. Fix it before Saturday."),
      m('coach_form_watch', 'cfw2', 'coach', "You're rushing the swing. I can see it from the tower. Slow down."),
      m('coach_form_watch', 'cfw3', 'coach', "Kicking coach wants ten minutes with you. Don't argue, just go.")
    ],
    coach_js_high: [
      m('coach_js_high', 'cjh1', 'coach', "You're my guy. I'm not shopping. Stop reading the internet."),
      m('coach_js_high', 'cjh2', 'coach', "Told the GM the kicking job is settled. Make me right.")
    ],
    coach_js_low: [
      m('coach_js_low', 'cjl1', 'coach', "I need to see better numbers. I'm not saying anything else. I'm saying that."),
      m('coach_js_low', 'cjl2', 'coach', "The other guy hit 6-for-6 today in practice. Just information."),
      m('coach_js_low', 'cjl3', 'coach', "We're evaluating everything this week. Everything includes you.")
    ],
    coach_hot_seat: [
      m('coach_hot_seat', 'chs1', 'coach', "Let me be direct: I don't trust the leg right now. Change my mind Saturday."),
      m('coach_hot_seat', 'chs2', 'coach', "I've had a conversation with the walk-on. You should know that."),
      m('coach_hot_seat', 'chs3', 'coach', "Two more weeks like this and we're having a different conversation.")
    ],
    coach_bench: [
      m('coach_bench', 'cb1', 'coach', "You're not kicking this week. Take the reps in practice. Get it back."),
      m('coach_bench', 'cb2', 'coach', "Backup gets the start. Nothing personal. Everything about it is personal.")
    ],
    coach_unbench: [
      m('coach_unbench', 'cub1', 'coach', "You're back up. Don't make me regret it in front of 60,000 people."),
      m('coach_unbench', 'cub2', 'coach', "Job's yours again. The other guy shanked two. You saw it.")
    ],
    coach_win: [
      m('coach_win', 'cw1', 'coach', "Good win. You did your job. That's the compliment."),
      m('coach_win', 'cw2', 'coach', "Nice kicks. Offense wants to claim them. I told them no."),
      m('coach_win', 'cw3', 'coach', "That's how you close a game. Ice bath, then film.")
    ],
    coach_loss: [
      m('coach_loss', 'cl1', 'coach', "Tough one. Wasn't on you. It was a little on you."),
      m('coach_loss', 'cl2', 'coach', "We'll look at the tape. Be at the facility early."),
      m('coach_loss', 'cl3', 'coach', "Losses happen. Misses at the end of losses get remembered. Just so you know.")
    ],
    coach_pregame: [
      m('coach_pregame', 'cp1', 'coach', "{opp} this week. Their rush unit is fast. Get it up quick."),
      m('coach_pregame', 'cp2', 'coach', "Wind's supposed to be a factor at {opp}. We'll adjust the range. Don't be a hero."),
      m('coach_pregame', 'cp3', 'coach', "Big game. Same swing. If I call for a long one, it's because I believe. Don't make me a liar.")
    ],
    coach_camp: [
      m('coach_camp', 'cc1', 'coach', "Six kicks Thursday. You and the other guy. Best leg starts. Simple."),
      m('coach_camp', 'cc2', 'coach', "Camp battle's on. I don't care who wins. I care that somebody does.")
    ],
    coach_rest: [
      m('coach_rest', 'cr1', 'coach', "Take the rest day. Legs are like batteries and yours is at 12 percent."),
      m('coach_rest', 'cr2', 'coach', "Rest week. Don't kick anything. Not even a rock.")
    ],
    agent_final_year: [
      m('agent_final_year', 'afy1', 'agent', "Final year of the deal. Every kick is a negotiation now. Make them all."),
      m('agent_final_year', 'afy2', 'agent', "Contract's up after this season. I've started making calls. Quiet ones."),
      m('agent_final_year', 'afy3', 'agent', "Reminder: contract year. Also reminder: I take a percentage. Kick accordingly.")
    ],
    agent_extension: [
      m('agent_extension', 'ae1', 'agent', "{team} put a number on the table. It's not insulting. It's not exciting. Let's talk."),
      m('agent_extension', 'ae2', 'agent', "Extension offer came in. I think we can push them ten percent. Maybe."),
      m('agent_extension', 'ae3', 'agent', "They want to extend you. I want to counter. You want to kick. Everybody wins.")
    ],
    agent_fa: [
      m('agent_fa', 'afa1', 'agent', "Free agency opens. {n} teams have asked about you. One asked about the punter by mistake."),
      m('agent_fa', 'afa2', 'agent', "Market update: interest is real. Money is 'developing'. Stay patient."),
      m('agent_fa', 'afa3', 'agent', "Offers are in. Some are good. One is a dome team. You like domes.")
    ],
    agent_tag: [
      m('agent_tag', 'at1', 'agent', "They tagged you. One year, guaranteed, no love. I'm furious on your behalf."),
      m('agent_tag', 'at2', 'agent', "Franchise tag. It's a compliment wrapped in a handcuff. We'll talk options.")
    ],
    agent_rookie: [
      m('agent_rookie', 'ar1', 'agent', "Rookie deal is signed. Four years. Now go be worth more than it."),
      m('agent_rookie', 'ar2', 'agent', "Welcome to the league. Your contract is small. Your leg is not. Prove it.")
    ],
    agent_market: [
      m('agent_market', 'am1', 'agent', "Your market value went up this week. Fame does that. Keep being famous."),
      m('agent_market', 'am2', 'agent', "Endorsement people are calling. I'm screening the weird ones. Most are weird.")
    ],
    agent_cut: [
      m('agent_cut', 'ac1', 'agent', "You've been released. It's business. I'm already on the phone with three teams."),
      m('agent_cut', 'ac2', 'agent', "Cut. Yeah. Take the day. Tomorrow we work the phones.")
    ],
    gm_welcome: [
      m('gm_welcome', 'gw1', 'gm', "Welcome to {team}. Locker's by the boiler. We'll move it when you make something."),
      m('gm_welcome', 'gwm2', 'gm', "Glad to have you in {city}. The last kicker left in a hurry. Don't ask.")
    ],
    gm_cut_warning: [
      m('gm_cut_warning', 'gcw1', 'gm', "We're bringing in a kicker for a workout. Routine. Very routine."),
      m('gm_cut_warning', 'gcw2', 'gm', "Coach and I talked. Numbers need to move. Yours, specifically.")
    ],
    gm_trade: [
      m('gm_trade', 'gt1', 'gm', "A team called about you. I said we're listening. We are listening."),
      m('gm_trade', 'gt2', 'gm', "Trade talk in the papers isn't from us. It's not NOT from us either.")
    ],
    gm_release: [
      m('gm_release', 'gr1', 'gm', "We've decided to go in a different direction. The direction is another kicker."),
      m('gm_release', 'gr2', 'gm', "Thank you for your contributions. Please return the playbook. It's mostly blank for you anyway.")
    ],
    press_request: [
      m('press_request', 'pr1', 'press', "Five minutes after practice? We want to ask about the wind. And the miss. Mostly the miss."),
      m('press_request', 'pr2', 'press', "Doing a feature on kickers who 'matter'. You might qualify. Call me."),
      m('press_request', 'pr3', 'press', "The {city} Ledger would love a quote on {opp}. Something spicy. Or bland, we'll spice it.")
    ],
    press_slump: [
      m('press_slump', 'ps1', 'press', "Working on a piece titled 'What's Wrong With {last}?' Any comment? No? That's a comment."),
      m('press_slump', 'ps2', 'press', "Three misses in three weeks. We ran the numbers. The numbers are not good. Thoughts?")
    ],
    press_hot: [
      m('press_hot', 'ph1', 'press', "{n} straight. We'd like to jinx it with an interview."),
      m('press_hot', 'ph2', 'press', "Cover story: 'The Most Reliable Man in {city}.' Photographer wants you 'brooding by goalposts'.")
    ],
    press_draft: [
      m('press_draft', 'pdr1', 'press', "Draft experts have you going round {round}. Draft experts also had a punter going round 2, so."),
      m('press_draft', 'pdr2', 'press', "Your combine numbers are out. Scouts are 'intrigued', which is scout for 'we saw a kicker'.")
    ],
    fan_love: [
      m('fan_love', 'fl1', 'fan', "Dude. DUDE. That kick. I named my dog after you. He's also a little weird."),
      m('fan_love', 'fl2', 'fan', "Season ticket holder since '94. You are the first kicker I have ever liked. Don't ruin it."),
      m('fan_love', 'fl3', 'fan', "My daughter wants your jersey. They don't sell kicker jerseys. We made one. It's ugly. She loves it.")
    ],
    fan_hate: [
      m('fan_hate', 'fh1', 'fan', "How do you miss that. HOW. My grandmother could make that and she has a walker."),
      m('fan_hate', 'fh2', 'fan', "I drove four hours to watch you shank one. Four. Hours. Refund my gas."),
      m('fan_hate', 'fh3', 'fan', "Started a petition. It's not personal. It's very personal.")
    ],
    fan_kid: [
      m('fan_kid', 'fk1', 'fan', "hi im 9 and i kick at recess and i pretend im you. do you ever get scared. -Marcus"),
      m('fan_kid', 'fk2', 'fan', "My mom says you're the best player because you never fumble. Is that true? -Ava, age 8")
    ],
    family_proud: [
      m('family_proud', 'fp1', 'family', "Watched every kick, sweetheart. Your father paused the TV on the good one for twenty minutes."),
      m('family_proud', 'fp2', 'family', "Grandpa says your follow-through looks like his did in '71. He also says a lot of things."),
      m('family_proud', 'fp3', 'family', "Proud of you, kid. Also, call your mother. -Dad")
    ],
    family_worry: [
      m('family_worry', 'fw1', 'family', "Saw the miss. Are you eating? You look thin on TV. Everyone looks thin on TV. Are you eating?"),
      m('family_worry', 'fw2', 'family', "Your aunt read something about kicker job security. She's very worried. Please email her.")
    ],
    family_home: [
      m('family_home', 'fhm1', 'family', "The whole town is coming to the game. Yes, all of them. We rented a bus. Two buses."),
      m('family_home', 'fhm2', 'family', "Your old high school put your picture up in the gym. Next to the fire exit. Still counts.")
    ],
    result_win: [
      m('result_win', 'rw1', 'press', "FINAL: {team} {score} over {opp}. {last} {line}."),
      m('result_win', 'rw2', 'press', "{team} win {score}. Kicker line: {line}. Holder line: uncredited.")
    ],
    result_loss: [
      m('result_loss', 'rl1', 'press', "FINAL: {opp} {score} over {team}. {last} {line}."),
      m('result_loss', 'rl2', 'press', "{team} lose {score}. {last} {line}. Talk radio: 'so anyway, the kicker'.")
    ]
  };

  var byId = {};
  for (var i = 0; i < headlines.length; i++) byId[headlines[i].id] = headlines[i];
  var tags = {};
  for (var j = 0; j < headlines.length; j++) {
    for (var k = 0; k < headlines[j].tags.length; k++) {
      var tg = headlines[j].tags[k];
      (tags[tg] = tags[tg] || []).push(headlines[j]);
    }
  }

  RTG.Data.headlines = headlines;
  RTG.Data.headlinesById = byId;
  RTG.Data.headlinesByTag = tags;
  RTG.Data.messages = messages;
})(typeof window !== 'undefined' ? window : globalThis);
