"use strict";

  /* ---------------- Levels ----------------
     To add a level, push one object into LEVELS_RAW. Only these fields
     are required:
       key, name          identity + display name
       enemies            MONSTERS keys picked between at random
       boss, bossName     MONSTERS key + display name for the level boss
       baseHp, baseGold   starting stats for a normal enemy (pre-scaling)
     Everything else (sky, decor, accent, killsPerBoss, bossAbilities) is
     optional and falls back to a default in normalizeLevel(), so a
     minimal level works immediately and can be dressed up later.

     A boss's bossAbilities list is itself data-driven:
       { type:'shield', every, duration, reduction }     periodic damage cut
       { type:'summon', every, addKey, addHpFrac }        periodic guard add
       { type:'regen', every, fraction, maxTicks, lowHpThreshold }
         only activates once hp falls to lowHpThreshold (fraction of
         maxHp, default 0.25); from then on heals `fraction` of its
         MISSING hp every `every` ms, capped at maxTicks per fight, after
         which it's permanently exhausted for the rest of the encounter.
         So the fight is always finite no matter how weak your damage is,
         and early hits are never wasted on a boss that just heals back.
     Leave it out (or empty) for a plain tank-and-spank boss.
  ---------------------------------------------- */
  var DEFAULT_KILLS_PER_BOSS = 8;
  var LEVELS_RAW = [
{ key:'forest', name:"Whispering Forest", enemies:['slime','goblin','sprig','mudpup','thornling','mosshopper','bramblewolf','gladefly'], boss:'ent', bossName:"Elder Ent",
      baseHp:12, baseGold:4, accent:'#9be27a',
      sky:'linear-gradient(180deg,#3a5a3a 0%, #1e3320 60%, #16240f 100%)',
      lore:"Sunlight barely reaches the forest floor, but slimes and goblins have made it home.",
      bossIntro:"The trees groan as the Elder Ent tears itself free of its roots.",
      victory:"The grove falls silent. A path deeper into the Warren opens.",
      decor:[ {k:'pine',x:'6%',y:'14%',s:70}, {k:'pine',x:'86%',y:'8%',s:56}, {k:'bush',x:'12%',y:'70%',s:60}, {k:'bush',x:'80%',y:'66%',s:54}, {k:'rock',x:'70%',y:'20%',s:34} ],
      bossAbilities:[ {type:'summon', every:11000, addKey:'goblin', addHpFrac:0.22} ] },
    { key:'hollow', name:"Mossy Hollow", enemies:['fungling','pixiemoth','bograt','willowisp','tangleroot','hollowstag'], boss:'hollowKing', bossName:"The Hollow King",
      baseHp:20, baseGold:6, accent:'#7ec9a8',
      sky:'linear-gradient(180deg,#2c4a3a 0%, #182f26 60%, #0f1e18 100%)',
      lore:"Deeper in, the trees close overhead and strange lights drift between the roots.",
      bossIntro:"Moss and roots knit themselves into a crown as the Hollow King rises.",
      victory:"The lights in the hollow finally settle, and the path opens on.",
      decor:[ {k:'pine',x:'8%',y:'10%',s:60}, {k:'bush',x:'82%',y:'18%',s:50}, {k:'bush',x:'14%',y:'68%',s:56}, {k:'rock',x:'76%',y:'64%',s:36} ],
      bossAbilities:[ {type:'summon', every:12000, addKey:'tangleroot', addHpFrac:0.22}, {type:'shield', every:9000, duration:3000, reduction:0.8} ] },
    { key:'cave', name:"Deep Cave", enemies:['bat','golem','caverat','gloomshroom','stalamite','tunnelworm','echobat','quartzcrab'], boss:'crystalGolem', bossName:"Crystal Golem",
      baseHp:35, baseGold:9, accent:'#8fd9ff',
      sky:'linear-gradient(180deg,#39324f 0%, #221d38 55%, #14101f 100%)',
      lore:"Cold air and crystal light. Something with wings nests further in the dark.",
      bossIntro:"Crystal shards knit themselves into a towering guardian.",
      victory:"The cave dims as the guardian crumbles to dust and quartz.",
      decor:[ {k:'crystal',x:'8%',y:'18%',s:48}, {k:'crystal',x:'84%',y:'62%',s:52}, {k:'rock',x:'78%',y:'16%',s:40}, {k:'rock',x:'14%',y:'68%',s:44} ],
      bossAbilities:[ {type:'shield', every:9000, duration:3000, reduction:0.85}, {type:'summon', every:16000, addKey:'bat', addHpFrac:0.18} ] },
    { key:'underdark', name:"Underdark Depths", enemies:['deepspider','gloomwraith','fungalhorror','blindstalker','cavetroll','voidmoth'], boss:'abyssalWarden', bossName:"The Abyssal Warden",
      baseHp:55, baseGold:14, accent:'#c98fff',
      sky:'linear-gradient(180deg,#2a1e3f 0%, #180f28 55%, #0d0716 100%)',
      lore:"The tunnels stop pretending to be natural down here.",
      bossIntro:"Something enormous finally opens its eyes in the dark.",
      victory:"Whatever it was guarding, it stops mattering now.",
      decor:[ {k:'crystal',x:'10%',y:'14%',s:40}, {k:'rock',x:'80%',y:'20%',s:46}, {k:'rock',x:'16%',y:'70%',s:38}, {k:'crystal',x:'82%',y:'66%',s:36} ],
      bossAbilities:[ {type:'regen', every:9000, fraction:0.12, maxTicks:5, lowHpThreshold:0.3}, {type:'summon', every:13000, addKey:'deepspider', addHpFrac:0.2} ] },
    { key:'frostpeak', name:"Frostpeak Foothills", enemies:['iceimp','frosthare','snowwolf','rimespider','glaciercrab','frostwisp'], boss:'frostWarden', bossName:"The Frost Warden",
      baseHp:90, baseGold:22, accent:'#bfe8ff',
      sky:'linear-gradient(180deg,#33475a 0%, #1c2836 55%, #10161e 100%)',
      lore:"The air turns sharp here, and the snow never quite melts.",
      bossIntro:"The ice groans as the Frost Warden pulls itself free of the mountain.",
      victory:"The frost cracks and falls away, and the foothills go quiet.",
      decor:[ {k:'rock',x:'8%',y:'16%',s:44}, {k:'crystal',x:'84%',y:'20%',s:40}, {k:'rock',x:'14%',y:'70%',s:40}, {k:'crystal',x:'80%',y:'64%',s:34} ],
      bossAbilities:[ {type:'shield', every:8000, duration:3500, reduction:0.85}, {type:'summon', every:12000, addKey:'rimespider', addHpFrac:0.22} ] },
    { key:'ruins', name:"Sundered Ruins", enemies:['rustbot','ruinwisp','animatedarmor','tombcrawler','archivist','gargoyle'], boss:'forgottenKing', bossName:"The Forgotten King",
      baseHp:150, baseGold:33, accent:'#e8c468',
      sky:'linear-gradient(180deg,#4a4030 0%, #2a2318 55%, #16110a 100%)',
      lore:"Someone built a city here, once. It didn't stay theirs.",
      bossIntro:"Dust falls from a throne that has waited a very long time for this.",
      victory:"The throne room finally, truly empties.",
      decor:[ {k:'rock',x:'10%',y:'14%',s:48}, {k:'rock',x:'82%',y:'18%',s:38}, {k:'rock',x:'16%',y:'68%',s:42}, {k:'rock',x:'78%',y:'66%',s:36} ],
      bossAbilities:[ {type:'summon', every:13000, addKey:'animatedarmor', addHpFrac:0.24}, {type:'shield', every:9000, duration:3200, reduction:0.82} ] },
    { key:'volcanic', name:"Volcanic Wastes", enemies:['emberimp','magmaslug','ashwraith','cinderhound','obsidiangolem','lavanewt'], boss:'cinderBaron', bossName:"The Cinder Baron",
      baseHp:250, baseGold:51, accent:'#ff8a4d',
      sky:'linear-gradient(180deg,#5a2e1e 0%, #331810 55%, #1a0c08 100%)',
      lore:"The ground itself is trying to kill you here, well before anything living joins in.",
      bossIntro:"The ground splits, and the Cinder Baron steps out of the flow.",
      victory:"The flow cools, just enough to pass.",
      decor:[ {k:'rock',x:'8%',y:'18%',s:46}, {k:'rock',x:'84%',y:'62%',s:40}, {k:'rock',x:'14%',y:'68%',s:36} ],
      bossAbilities:[ {type:'regen', every:9000, fraction:0.1, maxTicks:5, lowHpThreshold:0.3}, {type:'summon', every:12000, addKey:'cinderhound', addHpFrac:0.22} ] },
    { key:'fen', name:"Shadow Fen", enemies:['bogzombie','willothewisp','venomtoad','marshleech','rothag','plaguerat'], boss:'fenWitch', bossName:"The Fen Witch",
      baseHp:410, baseGold:78, accent:'#8fbf6f',
      sky:'linear-gradient(180deg,#2e3a24 0%, #1a2216 55%, #0d120a 100%)',
      lore:"The water is still, and so is everything that lives in it, until it is not.",
      bossIntro:"The reeds part on their own as the Fen Witch comes to greet you.",
      victory:"The Fen exhales, and for once the water is only water.",
      decor:[ {k:'bush',x:'10%',y:'16%',s:54}, {k:'pine',x:'82%',y:'12%',s:50}, {k:'bush',x:'16%',y:'70%',s:50}, {k:'rock',x:'78%',y:'66%',s:32} ],
      bossAbilities:[ {type:'shield', every:8500, duration:3200, reduction:0.85}, {type:'summon', every:12500, addKey:'rothag', addHpFrac:0.22} ] },
    { key:'storm', name:"Storm Reaches", enemies:['stormsprite','cloudserpent','thunderhawk','galewisp','lightningelemental','skyjelly'], boss:'stormHerald', bossName:"The Storm Herald",
      baseHp:680, baseGold:120, accent:'#cfe0ff',
      sky:'linear-gradient(180deg,#33405a 0%, #1c2536 55%, #0e131e 100%)',
      lore:"The wind never stops up here, and neither does whatever rides it.",
      bossIntro:"Thunder rolls once, twice, and the Storm Herald descends.",
      victory:"The sky clears, just long enough.",
      decor:[ {k:'rock',x:'10%',y:'70%',s:44}, {k:'crystal',x:'84%',y:'18%',s:34}, {k:'rock',x:'80%',y:'68%',s:32} ],
      bossAbilities:[ {type:'summon', every:12000, addKey:'thunderhawk', addHpFrac:0.24}, {type:'regen', every:9500, fraction:0.1, maxTicks:4, lowHpThreshold:0.28} ] },
    { key:'mythic', name:'Mythic Depths', enemies:['cerberus','scylla','minotaur','demon','cyclops','sphinx','medusa'], boss:'hydra', bossName:'The Hydra',
      baseHp:850, baseGold:150, accent:'#d97b9c',
      sky:'linear-gradient(180deg,#3a1a2e 0%, #200f1c 55%, #10070e 100%)',
      lore:"Old gods and older monsters, all crowded into the same dark hollow beneath the Peak.",
      bossIntro:"The water churns, and more than one head breaks the surface.",
      victory:"The last head finally stops moving. You count them twice, just to be sure.",
      decor:[ {k:'rock',x:'8%',y:'16%',s:44}, {k:'rock',x:'84%',y:'62%',s:38}, {k:'crystal',x:'14%',y:'68%',s:32} ],
      // Not periodic like the others -- this one runs itself: one head
      // spawns immediately, and clearing a whole wave of them opens a
      // window to hit the body directly. The next wave doubles in size
      // (capped at maxHeads) so the fight always finishes, it just asks
      // for more head-clearing as it goes. See triggerHydraWave.
      bossAbilities:[ {type:'hydraHeads', headKey:'hydraHead', initialHeads:1, maxHeads:8, headHpFrac:0.08, vulnerableDuration:6000} ] },
    { key:'peak', name:"Dragon's Peak", enemies:['skeleton','wyvern','boneknight','wyrmling','frostharpy','obsidianwyvern'], boss:'dragon', bossName:"Ancient Dragon",
      baseHp:1100, baseGold:190, accent:'#ffb35c',
      sky:'linear-gradient(180deg,#5a3327 0%, #2f1a1c 55%, #170d10 100%)',
      lore:"Thin air, old bones, and the smell of sulfur. You are not welcome here.",
      bossIntro:"The mountain itself seems to exhale as the Ancient Dragon wakes.",
      victory:"The last ember fades. The Warren has no greater test left to give, for now.",
      decor:[ {k:'rock',x:'10%',y:'66%',s:50}, {k:'rock',x:'82%',y:'70%',s:38}, {k:'crystal',x:'88%',y:'20%',s:36}, {k:'pine',x:'6%',y:'12%',s:44} ],
      bossAbilities:[ {type:'shield', every:8000, duration:3500, reduction:0.9}, {type:'summon', every:13000, addKey:'wyvern', addHpFrac:0.25} ],
      bossVariants:[
        { boss:'dragon', bossName:'Ember Dragon', bossIntro:'Heat shimmers off the Ember Dragon as it rises to meet you.',
          bossAbilities:[ {type:'shield', every:8000, duration:3500, reduction:0.9}, {type:'summon', every:13000, addKey:'wyvern', addHpFrac:0.25} ] },
        { boss:'dragonFrost', bossName:'Frost Dragon', bossIntro:'Frost creeps over the stones as the Frost Dragon opens one eye.',
          bossAbilities:[ {type:'shield', every:7000, duration:4000, reduction:0.92}, {type:'regen', every:9000, fraction:0.12, maxTicks:5, lowHpThreshold:0.3} ] },
        { boss:'dragonStorm', bossName:'Storm Dragon', bossIntro:'Thunder rolls off the peak as the Storm Dragon takes wing.',
          bossAbilities:[ {type:'summon', every:11000, addKey:'wyvern', addHpFrac:0.28}, {type:'regen', every:10000, fraction:0.1, maxTicks:4, lowHpThreshold:0.25} ] }
      ] }
  ];
  function normalizeLevel(lvl){
    return {
      key: lvl.key, name: lvl.name,
      enemies: lvl.enemies, boss: lvl.boss, bossName: lvl.bossName,
      baseHp: lvl.baseHp, baseGold: lvl.baseGold,
      accent: lvl.accent || '#e8c468',
      sky: lvl.sky || 'linear-gradient(180deg,#3a3a3a 0%, #202020 60%, #101010 100%)',
      lore: lvl.lore || '',
      bossIntro: lvl.bossIntro || (lvl.bossName+' appears!'),
      victory: lvl.victory || 'The realm trembles.',
      decor: lvl.decor || [],
      killsPerBoss: lvl.killsPerBoss || DEFAULT_KILLS_PER_BOSS,
      hpBossMult: lvl.hpBossMult || 7,
      goldBossMult: lvl.goldBossMult || 6,
      bossAbilities: lvl.bossAbilities || [],
      bossVariants: lvl.bossVariants || null
    };
  }
  var LEVELS = LEVELS_RAW.map(normalizeLevel);
  var STORY_INTRO = "Old maps mark this place 'the Warren': ten realms of forest, cave, ruin, and peak, each harder than the last, where monsters guard forgotten gold. Grab your blade, hunter.";

  // A small number of regular (non-boss) monsters get one signature move
  // of their own, on the same data-driven ability format bosses use (see
  // startBossAbilities/scheduleAbility in state.js) -- most monsters have
  // none of this and are just a click target, which is the point.
  var MONSTER_ABILITIES = {
    deepspider: { type:'webPull', every:7000 }
  };

  /* ---------------- Bestiary ----------------
     One entry per MONSTERS key. Add lore/power text here when a new
     monster is added -- an entry with no matching MONSTERS key just
     never shows up, so this can grow ahead of the roster.
  ---------------------------------------------- */
  var BESTIARY = {
    slime: { lore:"A common denizen of damp places, more curious than dangerous.", power:"No special power." },
    goblin: { lore:"Quick-fingered scavengers that raid the Whispering Forest in pairs.", power:"No special power." },
    ent: { lore:"Once a quiet guardian of the grove, roused to violence by trespassers.", power:"Summons a goblin guardian to shield itself for a while." },
    bat: { lore:"Echoes bounce oddly in the Deep Cave where these things roost by the hundred.", power:"No special power." },
    golem: { lore:"Ancient stone given crude life by forgotten magic, moss thick in its cracks.", power:"No special power." },
    crystalGolem: { lore:"Formed from the cave's own crystal veins, humming with cold light.", power:"Raises a damage-reducing shield, and can summon a bat guardian." },
    skeleton: { lore:"Old bones on Dragon's Peak that never quite settled into rest.", power:"No special power." },
    wyvern: { lore:"Smaller and meaner than its ancient dragon cousins, but no less quick to bite.", power:"No special power." },
    dragon: { lore:"The Warren's oldest and cruelest resident, said to have outlived three eras of hunters.", power:"Shields itself, summons wyverns, and slowly regenerates lost health -- though it tires of that trick after a few tries." },
    dragonFrost: { lore:"A colder echo of the same ancient bloodline, nesting where the Ember Dragon never bothered to.", power:"Shields itself and slowly regenerates -- no summons, just patience." },
    dragonStorm: { lore:"The youngest and most restless of the Peak's dragons, never quite landing for long.", power:"Summons wyverns and slowly regenerates lost health." },
sprig: { lore:"A wandering offshoot of something larger, still learning to walk.", power:"No special power." },
    mudpup: { lore:"Forest strays that travel in noisy little packs.", power:"No special power." },
    thornling: { lore:"A bramble patch that got tired of staying put.", power:"No special power." },
    mosshopper: { lore:"Croaks loud enough to give away every other creature nearby -- if you're quick.", power:"No special power." },
    bramblewolf: { lore:"Thorns for fur, and a bad habit of hunting in the tall grass.", power:"No special power." },
    gladefly: { lore:"Iridescent and harmless alone -- the swarms are the problem.", power:"No special power." },
    fungling: { lore:"A mushroom cap that learned to walk, badly.", power:"No special power." },
    pixiemoth: { lore:"Drawn to warmth, and to gold, in about equal measure.", power:"No special power." },
    bograt: { lore:"Bigger than a rat has any right to be, and it knows it.", power:"No special power." },
    willowisp: { lore:"Follows lanterns, then quietly outshines them.", power:"No special power." },
    tangleroot: { lore:"Roots that reach further than they should, and grip harder than expected.", power:"No special power." },
    hollowstag: { lore:"Antlers hung with moss, eyes that catch no light at all.", power:"No special power." },
    hollowKing: { lore:"What the Hollow used to worship, before it forgot the difference between king and root.", power:"Summons Tanglethorn guards, and shields itself in bark for a time." },
    caverat: { lore:"Bold in the dark, less so anywhere near torchlight.", power:"No special power." },
    gloomshroom: { lore:"Glows just enough to lure something closer.", power:"No special power." },
    stalamite: { lore:"Drops from the ceiling before you ever hear it coming.", power:"No special power." },
    tunnelworm: { lore:"Carved half these tunnels itself, given enough centuries.", power:"No special power." },
    echobat: { lore:"Screeches loud enough that you feel it before you hear it.", power:"No special power." },
    quartzcrab: { lore:"Its shell grew straight out of the cave wall.", power:"No special power." },
    deepspider: { lore:"Weaves webs thick enough to catch more than flies.", power:"Fires a web that yanks at your aim every few seconds." },
    gloomwraith: { lore:"A shadow that forgot it was supposed to belong to someone.", power:"No special power." },
    fungalhorror: { lore:"Spores first, questions never.", power:"No special power." },
    blindstalker: { lore:"Hunts by sound alone, and has never once needed eyes.", power:"No special power." },
    cavetroll: { lore:"Slow, enormous, and perpetually annoyed at being woken up.", power:"No special power." },
    voidmoth: { lore:"Wings that seem to drink the torchlight rather than reflect it.", power:"No special power." },
    abyssalWarden: { lore:"Posted here so long ago that no one, including it, remembers what it was guarding.", power:"Regenerates when badly hurt, and summons Deep Spiders to buy itself time." },
    iceimp: { lore:"Small, gleeful, and always underfoot right when you need traction most.", power:"No special power." },
    frosthare: { lore:"Faster on ice than anything has a right to be.", power:"No special power." },
    snowwolf: { lore:"Hunts in packs that move like drifting snow until it is too late.", power:"No special power." },
    rimespider: { lore:"Its webs freeze solid the instant they leave its body.", power:"No special power." },
    glaciercrab: { lore:"Looks like an ice shelf until the ice shelf moves.", power:"No special power." },
    frostwisp: { lore:"A cold that has learned to want company.", power:"No special power." },
    frostWarden: { lore:"Carved from the mountain to keep something else from getting out -- or in.", power:"Raises a frost shield, and calls Rime Spiders down from the ledges." },
    rustbot: { lore:"Still following orders no one alive remembers giving.", power:"No special power." },
    ruinwisp: { lore:"A memory of a torchbearer, still doing its rounds.", power:"No special power." },
    animatedarmor: { lore:"Empty inside, and still remembers how to hold a line.", power:"No special power." },
    tombcrawler: { lore:"Older than the ruin, and considerably less patient with visitors.", power:"No special power." },
    archivist: { lore:"Still cataloguing a library that burned down centuries ago.", power:"No special power." },
    gargoyle: { lore:"Perfectly still, right up until it very much is not.", power:"No special power." },
    forgottenKing: { lore:"Crowned himself long after anyone was left to object.", power:"Commands Animated Armor to his defense, and shrugs off blows behind an old shield." },
    emberimp: { lore:"Sets small fires purely for the company.", power:"No special power." },
    magmaslug: { lore:"Slow enough to outrun, but it never has to run itself.", power:"No special power." },
    ashwraith: { lore:"What's left drifting after the fire's already had its meal.", power:"No special power." },
    cinderhound: { lore:"Runs in packs that leave scorch marks in the shape of paws.", power:"No special power." },
    obsidiangolem: { lore:"Cooled from the same flow that carved this valley.", power:"No special power." },
    lavanewt: { lore:"Comfortable in heat that would cook anything else on sight.", power:"No special power." },
    cinderBaron: { lore:"Claims to have ruled this valley since before it had lava in it.", power:"Regenerates in the heat, and calls Cinder Hounds to run interference." },
    bogzombie: { lore:"Been walking these reeds long after it had any reason to.", power:"No special power." },
    willothewisp: { lore:"Leads travelers off the path, purely out of habit.", power:"No special power." },
    venomtoad: { lore:"Bright colors mean something in the Fen, and it's never good news.", power:"No special power." },
    marshleech: { lore:"Patient in a way that should worry you more than it does.", power:"No special power." },
    rothag: { lore:"Trades in favors nobody remembers agreeing to.", power:"No special power." },
    plaguerat: { lore:"One is a nuisance. It is never just one.", power:"No special power." },
    fenWitch: { lore:"Every path through the Fen leads back to her hut eventually.", power:"Shields herself in old magic, and calls a Rot Hag to bar the way." },
    stormsprite: { lore:"Crackles when it's happy, which is often, and dangerous.", power:"No special power." },
    cloudserpent: { lore:"Swims through the clouds the way fish swim through water.", power:"No special power." },
    thunderhawk: { lore:"The crack of thunder you hear is usually it, diving.", power:"No special power." },
    galewisp: { lore:"Never quite touches the ground, and never quite leaves either.", power:"No special power." },
    lightningelemental: { lore:"Arrives before the sound of its own arrival.", power:"No special power." },
    skyjelly: { lore:"Drifts on the thermals, harmless until it lands on you.", power:"No special power." },
    stormHerald: { lore:"Announces every storm on the Peak before it arrives -- including its own.", power:"Calls down Thunder Hawks, and regenerates on the wind between strikes." },
    boneknight: { lore:"Still armored, still armed, and still absolutely furious about it.", power:"No special power." },
    wyrmling: { lore:"Too young to breathe fire yet. Give it time.", power:"No special power." },
    frostharpy: { lore:"Nests where the air is too thin for anything sensible.", power:"No special power." },
    obsidianwyvern: { lore:"A wyvern that outlived enough hunters to stop bothering with color.", power:"No special power." },

    cerberus: { lore:"Guards a gate that isn't there anymore, out of pure habit.", power:"Bites three times as often as it should. Somehow still only one dog." },
    scylla: { lore:"Six mouths, six ways to lose a hand. Best to keep your distance.", power:"No special power." },
    minotaur: { lore:"Still looking for a way out of a maze that was torn down centuries ago.", power:"No special power." },
    demon: { lore:"Made a deal with someone, once. Doesn't remember who anymore.", power:"No special power." },
    cyclops: { lore:"One eye means no blind spots -- it's always looking straight at you.", power:"No special power." },
    sphinx: { lore:"Asks a riddle before every fight. Attacks the instant you get it wrong.", power:"No special power." },
    medusa: { lore:"Don't make eye contact. Everything else about her is negotiable.", power:"No special power." },
    hydra: { lore:"Cut off one head and two grow back -- so the old story goes. It's worse than that.", power:"Grows more heads every time you clear a wave of them. The body itself is safe to hit only in the moment right after the last head falls." },
    matti: { lore:"A wandering challenger who stumbled into the Warren and simply decided to stay.", power:"Unknown. Defeat him to find out." }
  };

  /* ---------------- Achievements ----------------
     Unlocked by calling unlockAchievement(id) at the relevant trigger
     point (see call sites); the function itself no-ops once earned, so
     call sites don't need to guard against re-firing. Permanent -- they
     survive Ascend and only clear on a full Reset.
  ---------------------------------------------- */
  var ACHIEVEMENTS = [
    { id:'firstBlood', name:'First Blood', desc:'Defeat your first monster.' },
    { id:'giantSlayer', name:'Giant Slayer', desc:'Defeat your first boss.' },
    { id:'ascended', name:'Ascended', desc:'Ascend for the first time.' },
    { id:'villageFounder', name:'Village Founder', desc:'Build your first Village structure.' },
    { id:'highRoller', name:'High Roller', desc:'Win a bet on green at the Gambling Den.' },
    { id:'gotMattid', name:"Get Matti'd", desc:'Matti appears.' },
    { id:'collector', name:'Collector', desc:'Discover every monster in the Bestiary.' },
    { id:'dragonslayer5', name:'Dragonslayer', desc:'Defeat the Ancient Dragon five times and unlock Ascend.' }
  ];
  var MEDAL_ICON_SVG = svgFromGrid(
    ["..oooo..",".oyyyyo.","oyywyyyo","oyyyyyyo","oyyyyyyo",".oyyyyo.","..oooo..","........"],
    { o:'#8a6a1f', y:'#e8c468', w:'#fff3cf' }
  );
  document.getElementById('achvOpenIcon').innerHTML = MEDAL_ICON_SVG;
  function unlockAchievement(id){
    if(state.achievements[id]) return;
    state.achievements[id] = true;
    var a = ACHIEVEMENTS.filter(function(x){ return x.id===id; })[0];
    if(a) toast('Achievement unlocked: '+a.name+'!');
    renderAchievements();
    save();
  }
  function bestiaryKeys(){
    return Object.keys(MONSTERS).filter(function(k){ return !MONSTERS[k].hideFromBestiary; });
  }
  function checkCollectorAchievement(){
    if(bestiaryKeys().every(function(k){ return state.defeated[k]; })) unlockAchievement('collector');
  }

  /* ---------------- Upgrades ----------------
     Add an upgrade by pushing one object here -- nothing else in the
     file needs to change. Fields:
       id, name, desc     identity + shop copy
       baseCost, costMult price now, and its growth per level bought
                          (cost = baseCost * costMult^currentLevel)
       effect(level)      this upgrade's own contribution at a level
       format(value)      how effect()'s return value reads in the shop
       role               which stat it feeds. Same-role upgrades stack:
                            'clickFlat'/'dpsFlat'/'critChance'/'goldFlat'
                              -> added together (sumEffect)
                            'clickMult'/'dpsMult'/'goldMult'
                              -> multiplied together, so effect(0) must be 1 (multEffect)
                            'critMultAdd' -> added on top of a 1.5x base
       requires (optional) {id, level} of another upgrade that must
                          reach that level first; hidden from the shop
                          (and from all stat math) until then
  ---------------------------------------------- */
  // Shown as section headers in the Camp Shop, in this order -- purely
  // cosmetic grouping, doesn't affect stat math at all.
  var UPGRADE_CATEGORIES = [
    { id:'click', label:'Click Damage' },
    { id:'auto', label:'Auto Damage' },
    { id:'crit', label:'Critical Hits' },
    { id:'gold', label:'Gold' },
    { id:'luck', label:'Luck' }
  ];
  var UPGRADES = [
    { id:'click', category:'click', name:'Sharper Claws', role:'clickFlat', desc:'+1 click damage / level', baseCost:10, costMult:1.15,
      effect:function(lvl){ return lvl; }, format:function(v){ return '+'+v+' dmg'; } },
    { id:'clickMult', category:'click', name:'Iron Grip', role:'clickMult', desc:'+12% click damage', baseCost:130, costMult:1.25,
      requires:{id:'click', level:3},
      effect:function(lvl){ return 1+lvl*0.12; }, format:function(v){ return v.toFixed(2)+'x'; } },
    { id:'forgeBlade', category:'click', name:'Forge-Tempered Blade', role:'clickFlat', desc:'+3 click damage / level (needs the Forge)', baseCost:120, costMult:1.2,
      requires:{id:'forge', level:1, source:'village'},
      effect:function(lvl){ return lvl*3; }, format:function(v){ return '+'+v+' dmg'; } },

    { id:'dps', category:'auto', name:'Trained Helper', role:'dpsFlat', desc:'+1 auto damage per second', baseCost:25, costMult:1.17,
      effect:function(lvl){ return lvl; }, format:function(v){ return v+'/s'; } },
    { id:'dpsMult', category:'auto', name:"Helper's Whetstone", role:'dpsMult', desc:'+15% auto damage', baseCost:90, costMult:1.25,
      requires:{id:'dps', level:1},
      effect:function(lvl){ return 1+lvl*0.15; }, format:function(v){ return v.toFixed(2)+'x'; } },
    { id:'dps2', category:'auto', name:'Apprentice Hunter', role:'dpsFlat', desc:'+4 auto damage per second', baseCost:150, costMult:1.2,
      requires:{id:'dps', level:3},
      effect:function(lvl){ return lvl*4; }, format:function(v){ return v+'/s'; } },
    { id:'dps3', category:'auto', name:'Veteran Warband', role:'dpsFlat', desc:'+15 auto damage per second', baseCost:600, costMult:1.22,
      requires:{id:'dps2', level:3},
      effect:function(lvl){ return lvl*15; }, format:function(v){ return v+'/s'; } },
    { id:'barracksDrill', category:'auto', name:'Barracks Drill', role:'dpsFlat', desc:'+8 auto damage per second (needs the Barracks)', baseCost:180, costMult:1.2,
      requires:{id:'barracks', level:1, source:'village'},
      effect:function(lvl){ return lvl*8; }, format:function(v){ return v+'/s'; } },

    { id:'crit', category:'crit', name:'Lucky Strike', role:'critChance', desc:'+3% crit chance (clicks & auto)', baseCost:50, costMult:1.22,
      effect:function(lvl){ return lvl*0.03; }, format:function(v){ return Math.round(v*100)+'%'; } },
    { id:'critMult', category:'crit', name:'Heavy Blow', role:'critMultAdd', desc:'+0.3x crit damage (clicks & auto)', baseCost:75, costMult:1.22,
      requires:{id:'crit', level:1},
      effect:function(lvl){ return lvl*0.3; }, format:function(v){ return '+'+v.toFixed(1)+'x'; } },
    { id:'crit2', category:'crit', name:'Keen Eye', role:'critChance', desc:'+2% crit chance (clicks & auto)', baseCost:300, costMult:1.25,
      requires:{id:'crit', level:5},
      effect:function(lvl){ return lvl*0.02; }, format:function(v){ return Math.round(v*100)+'%'; } },
    { id:'shrineBlessing', category:'crit', name:'Blessed Edge', role:'critMultAdd', desc:'+0.4x crit damage (needs the Shrine)', baseCost:200, costMult:1.22,
      requires:{id:'shrine', level:1, source:'village'},
      effect:function(lvl){ return lvl*0.4; }, format:function(v){ return '+'+v.toFixed(1)+'x'; } },

    { id:'gold', category:'gold', name:"Merchant's Favor", role:'goldMult', desc:'+8% gold from kills', baseCost:60, costMult:1.19,
      effect:function(lvl){ return 1+lvl*0.08; }, format:function(v){ return v.toFixed(2)+'x'; } },
    { id:'goldFlat', category:'gold', name:"Prospector's Fortune", role:'goldFlat', desc:'+1 flat gold per kill', baseCost:40, costMult:1.2,
      requires:{id:'gold', level:1},
      effect:function(lvl){ return lvl; }, format:function(v){ return '+'+v+'g'; } },
    { id:'gold2', category:'gold', name:'Treasure Map', role:'goldMult', desc:'+12% gold from kills', baseCost:400, costMult:1.24,
      requires:{id:'gold', level:3},
      effect:function(lvl){ return 1+lvl*0.12; }, format:function(v){ return v.toFixed(2)+'x'; } },
    { id:'watchtowerScout', category:'gold', name:"Scout's Bounty", role:'goldFlat', desc:'+3 flat gold per kill (needs the Watchtower)', baseCost:150, costMult:1.2,
      requires:{id:'watchtower', level:1, source:'village'},
      effect:function(lvl){ return lvl*3; }, format:function(v){ return '+'+v+'g'; } },
    { id:'wellTap', category:'gold', name:'Deep Well Tap', role:'goldMult', desc:'+10% gold from kills (needs the Well)', baseCost:250, costMult:1.22,
      requires:{id:'well', level:1, source:'village'},
      effect:function(lvl){ return 1+lvl*0.1; }, format:function(v){ return v.toFixed(2)+'x'; } },

    // Luck doesn't touch damage or gold math at all -- it just raises the
    // odds a regular kill also drops a bonus Gambling Token, so it's the
    // upgrade line that feeds the minigame instead of the fight.
    { id:'luck', category:'luck', name:'Four-Leaf Charm', role:'tokenLuck', desc:'+1% chance a regular kill also drops a Gambling Token', baseCost:80, costMult:1.24,
      effect:function(lvl){ return lvl*0.01; }, format:function(v){ return Math.round(v*100)+'%'; } }
  ];
  function isUnlocked(u){
    if(!u.requires) return true;
    // requires.source lets an upgrade gate on a permanent Village building
    // instead of another Camp Shop upgrade -- buying a building "opens it
    // up" for a themed run upgrade, without the building itself losing
    // its own permanent effect.
    var levels = u.requires.source === 'village' ? state.villageLevels : state.upgradeLevels;
    return (levels[u.requires.id]||0) >= u.requires.level;
  }

  /* ---------------- Village ----------------
     Permanent buildings bought with Blessings instead of gold. Unlike
     Camp Shop upgrades (state.upgradeLevels, wiped on Ascend), village
     levels live in state.villageLevels and are carried through Ascend on
     purpose -- this is where a run's Blessings turn into lasting power.
     Same shape as UPGRADES (id/name/desc/baseCost/costMult/effect/format/
     role), so adding a building is just pushing one more object here.
  ---------------------------------------------- */
  var VILLAGE = [
    { id:'watchtower', name:'Watchtower', icon:'watchtower', role:'goldMult', desc:'+20% gold from kills, forever', baseCost:1, costMult:1.6,
      effect:function(lvl){ return 1+lvl*0.2; }, format:function(v){ return v.toFixed(2)+'x'; } },
    { id:'forge', name:'Forge', icon:'forge', role:'clickMult', desc:'+20% click damage, forever', baseCost:1, costMult:1.6,
      effect:function(lvl){ return 1+lvl*0.2; }, format:function(v){ return v.toFixed(2)+'x'; } },
    { id:'barracks', name:'Barracks', icon:'barracks', role:'dpsMult', desc:'+20% auto damage, forever', baseCost:1, costMult:1.6,
      effect:function(lvl){ return 1+lvl*0.2; }, format:function(v){ return v.toFixed(2)+'x'; } },
    { id:'shrine', name:'Shrine', icon:'shrine', role:'critChance', desc:'+5% crit chance, forever', baseCost:1, costMult:1.7,
      effect:function(lvl){ return lvl*0.05; }, format:function(v){ return Math.round(v*100)+'%'; } },
    { id:'well', name:'Well', icon:'well', role:'goldFlat', desc:'+5 flat gold per kill, forever', baseCost:2, costMult:1.65,
      effect:function(lvl){ return lvl*5; }, format:function(v){ return '+'+v+'g'; } },
    // No stat role -- this one's a pure gate. Build it once to unlock the
    // Gambling Den (roulette, and the Tokens currency showing up at all);
    // further levels are just a Blessings sink like any other building.
    { id:'casino', name:'Casino', icon:'casino', desc:'Unlocks the Gambling Den', baseCost:3, costMult:1.8,
      effect:function(lvl){ return lvl; }, format:function(v){ return v>=1 ? 'Open for business' : 'Not built yet'; } }
  ];
  function casinoBuilt(){ return (state.villageLevels.casino||0) >= 1; }
  function villageCost(b){ return Math.round(b.baseCost * Math.pow(b.costMult, state.villageLevels[b.id]||0)); }
  function totalVillageLevels(){
    return VILLAGE.reduce(function(sum,b){ return sum+(state.villageLevels[b.id]||0); }, 0);
  }

  // Camp Shop upgrades and Village buildings feed the same stat roles, so
  // one pass over both sources aggregates everything that shares a role.
  function sumEffect(role){
    var total = 0;
    UPGRADES.forEach(function(u){ if(u.role===role) total += u.effect(state.upgradeLevels[u.id]||0); });
    VILLAGE.forEach(function(b){ if(b.role===role) total += b.effect(state.villageLevels[b.id]||0); });
    return total;
  }
  function multEffect(role){
    var total = 1;
    UPGRADES.forEach(function(u){ if(u.role===role) total *= u.effect(state.upgradeLevels[u.id]||0); });
    VILLAGE.forEach(function(b){ if(b.role===role) total *= b.effect(state.villageLevels[b.id]||0); });
    return total;
  }
