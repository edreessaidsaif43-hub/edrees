// البيئات الخمس: العالم والحيوانات وترتيب الهروب والزائر النادر
import * as THREE from 'three';
import { heightAt, buildGround, buildPond, animPond, buildForest, buildMist, animMist } from './forest.js';
import { buildDesertWorld, buildBeachWorld, buildReefWorld, buildMountainWorld } from './worlds.js';
import { buildGazelle, buildIbex, buildFox, buildLeopard, buildHare, buildHedgehog, buildTurtle, buildBird, buildButterfly,
  buildCamel, buildOryx, buildSandFox, buildJerboa, buildLizard, buildSeaTurtle, buildCrab, buildDolphin, buildWhale,
  buildFish, FISH, buildSchool, buildWhaleShark, buildPuffer, buildRay, buildOctopus, buildSeahorse, buildGoat, buildDonkey, buildCat, buildTahr } from './animals.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const BF = ['#ffb21a|#ff5a3a', '#7ad8ff|#2a6ae0', '#ff8ad0|#ffffff', '#ffe04a|#ff8a1a', '#b48aff|#ffffff', '#ffffff|#ffb21a'];
const flies = (n, x0, z0, dx, Y, g = 'bfly') => BF.slice(0, n).map((c, i) => { const [a, b] = c.split('|'); return { id: g + i, ar: 'الفراشات', em: '🦋', b: () => buildButterfly(a, b), home: V(x0 + i * dx, 0, z0 + (i % 3) * 3), yaw: 0, fly: true, bfly: true, exit: [V(-30 + i * 12, 24, -50)], spd: 9, g }; });

export const SCENES = [
  // ---------------- غابة ظفار ----------------
  {
    id: 'forest', ar: 'غابة ظفار', em: '🌳', desc: 'شلال وبركة وغزلان وثعلب وطيور في خريف ظفار',
    sky: 'khareef', fog: [0xd8f4ea, 70, 260], sun: [.55, .62, .45],
    rare: { ar: 'النمر العربي', em: '🐆', msg: 'هدوؤكم الرائع أخرجه من مخبئه — لا تخيفوه!' },
    build(S, Q) { buildGround(S, Q); const pond = buildPond(S, Q), forest = buildForest(S, Q), mist = buildMist(S, Q); return { H: heightAt, forest, update(t, dt) { animPond(pond, t, dt); animMist(mist, dt); forest.sway.forEach((m, i) => { m.rotation.z = Math.sin(t * .7 + i) * .012; }); } }; },
    order: ['rare', 'bee', 'bfly', 'gz1', 'hr1', 'duck', 'fox', 'hoo', 'gz2', 'hr2', 'bird2', 'hog', 'ibx', 'tur'],
    agents(W) {
      const Y = W.H, lr = W.forest.leoRock, lt = W.forest.ledgeTop;
      return [
        { id: 'leo', ar: 'النمر العربي', em: '🐆', b: buildLeopard, home: V(lr.x, lr.y, lr.z), yaw: -.9, pose: 'lie', rare: true, exit: [V(14, 0, -16), V(26, 0, -48)], spd: 11, g: 'rare' },
        { id: 'bee1', ar: 'الوروار', em: '🐦', b: () => buildBird('beeeater'), home: V(12.4, Y(12, -4) + 3.45, -4.3), yaw: .4, fly: true, exit: [V(40, 22, -40)], spd: 13, g: 'bee' },
        { id: 'bee2', ar: 'الوروار', em: '🐦', b: () => buildBird('beeeater'), home: V(11.3, Y(12, -4) + 3.35, -3.6), yaw: -.3, fly: true, exit: [V(36, 26, -44)], spd: 13, g: 'bee' },
        ...flies(6, -6, 3, 3.2),
        { id: 'gz1', ar: 'الغزال', em: '🦌', b: buildGazelle, home: V(3.2, 0, -6.5), yaw: -1.85, pose: 'graze', exit: [V(-1, 0, -19), V(-5, 0, -48)], spd: 15, g: 'gz1', bound: true },
        { id: 'hr1', ar: 'الأرنب', em: '🐇', b: buildHare, home: V(3.5, 0, 6.5), yaw: -.7, exit: [V(17, 0, 8), V(46, 0, 9)], spd: 11, g: 'hr1' },
        ...[[-11.5, -7.8], [-7.6, -4.6], [-13.8, -4.2]].map(([x, z], i) => ({ id: 'dk' + i, ar: 'البط', em: '🦆', b: () => buildBird('duck'), home: V(x, -.12, z), yaw: i, swim: true, fly: true, exit: [V(-42, 20, -46)], spd: 12, g: 'duck', sc: 1.25 })),
        { id: 'fox', ar: 'الثعلب', em: '🦊', b: buildFox, home: V(-3.5, 0, 4), yaw: .55, pose: 'sit', exit: [V(-15, 0, 7), V(-46, 0, 5)], spd: 13, g: 'fox' },
        { id: 'hoo', ar: 'الهدهد', em: '🐦', b: () => buildBird('hoopoe'), home: V(.6, 0, 1.4), yaw: 1.1, fly: true, exit: [V(30, 18, -40)], spd: 11, g: 'hoo' },
        { id: 'gz2', ar: 'الغزال الصغير', em: '🦌', b: buildGazelle, sc: 1.16, home: V(7.4, 0, -10), yaw: 2.4, pose: 'graze', exit: [V(10, 0, -23), V(6, 0, -50)], spd: 14, g: 'gz2', bound: true },
        { id: 'hr2', ar: 'الأرنب', em: '🐇', b: buildHare, home: V(-8, 0, 9.5), yaw: .9, exit: [V(-20, 0, 12), V(-46, 0, 15)], spd: 11, g: 'hr2' },
        { id: 'bul', ar: 'البلبل', em: '🐦', b: () => buildBird('bulbul'), home: V(9, Y(9, 1) + .78, 1), yaw: -.6, fly: true, exit: [V(38, 20, -30)], spd: 12, g: 'bird2' },
        { id: 'sun', ar: 'طائر الشمس', em: '🐦', b: () => buildBird('sunbird'), home: V(-5.2, 0, 6.6), yaw: .3, fly: true, exit: [V(-38, 22, -36)], spd: 13, g: 'bird2' },
        { id: 'hog', ar: 'القنفذ', em: '🦔', b: buildHedgehog, home: V(7.2, 0, 9.4), yaw: -.5, exit: [V(22, 0, 11), V(46, 0, 8)], spd: 6.5, g: 'hog' },
        { id: 'ibx', ar: 'الوعل', em: '🐐', b: buildIbex, home: V(lt.x, lt.y, lt.z), yaw: -.35, exit: [V(22, 0, -34), V(28, 0, -62)], spd: 10, g: 'ibx' },
        { id: 'tur', ar: 'السلحفاة', em: '🐢', b: buildTurtle, home: V(-.9, 0, -2.4), yaw: .6, hider: true, g: 'tur' }
      ];
    }
  },
  // ---------------- رمال الشرقية ----------------
  {
    id: 'desert', ar: 'رمال الشرقية', em: '🐪', desc: 'كثبان ذهبية وجِمال وجرابيع وضبّ وصقر وخيمة بدوية',
    sky: 'desertGold', fog: [0xffe2c0, 80, 300], sun: [.7, .5, .35],
    rare: { ar: 'قطيع المها العربي', em: '🦌', msg: 'المها العربي رمز عُمان — جاء لأن الصحراء هادئة!' },
    build(S, Q) { return buildDesertWorld(S, Q); },
    order: ['rare', 'sg', 'fal', 'jb1', 'hr', 'fox', 'lz1', 'jb2', 'calf', 'lz2', 'camel'],
    agents(W) {
      const Y = W.H;
      return [
        ...[[-7, -15], [-3.5, -17], [0, -14.5]].map(([x, z], i) => ({ id: 'ox' + i, ar: 'المها العربي', em: '🦌', b: buildOryx, home: V(x, 0, z), yaw: .4 + i * .5, pose: 'graze', rare: true, exit: [V(x - 4, 0, -32), V(x - 6, 0, -64)], spd: 12, g: 'rare' })),
        ...[[-2, 6], [-.6, 7.3], [.9, 6.2]].map(([x, z], i) => ({ id: 'sg' + i, ar: 'القطا', em: '🐦', b: () => buildBird('sandgrouse'), home: V(x, 0, z), yaw: i - 1, fly: true, exit: [V(-30 + i * 8, 20, -40)], spd: 13, g: 'sg' })),
        { id: 'fal', ar: 'الصقر', em: '🦅', b: () => buildBird('falcon'), home: V(9, Y(9, 2) + 1.05, 2), yaw: -.5, fly: true, exit: [V(40, 26, -30)], spd: 14, g: 'fal' },
        { id: 'jb1', ar: 'الجربوع', em: '🐭', b: buildJerboa, home: V(5, 0, 6), yaw: -.6, exit: [V(17, 0, 8), V(44, 0, 9)], spd: 11, g: 'jb1' },
        { id: 'hr', ar: 'الأرنب البري', em: '🐇', b: buildHare, home: V(-9.5, 0, 6.5), yaw: .8, exit: [V(-20, 0, 10), V(-46, 0, 12)], spd: 11, g: 'hr' },
        { id: 'fox', ar: 'ثعلب الرمل', em: '🦊', b: buildSandFox, home: V(-3.5, 0, 1), yaw: .4, pose: 'sit', exit: [V(-14, 0, 2), V(-46, 0, 0)], spd: 13, g: 'fox' },
        { id: 'lz1', ar: 'الضبّ', em: '🦎', b: buildLizard, home: V(2.5, 0, 1.5), yaw: -1.2, hider: true, g: 'lz1' },
        { id: 'jb2', ar: 'الجربوع', em: '🐭', b: buildJerboa, home: V(-6.5, 0, 9.5), yaw: .5, exit: [V(-18, 0, 12), V(-44, 0, 14)], spd: 11, g: 'jb2' },
        { id: 'calf', ar: 'الحوار الصغير', em: '🐪', b: () => buildCamel(true), sc: .9, home: V(6.5, 0, -6), yaw: -1.4, pose: 'graze', exit: [V(14, 0, -20), V(22, 0, -52)], spd: 9, g: 'calf' },
        { id: 'lz2', ar: 'الضبّ', em: '🦎', b: buildLizard, home: V(10, 0, 7.5), yaw: -.4, hider: true, g: 'lz2' },
        { id: 'cam', ar: 'الجمل', em: '🐪', b: () => buildCamel(false), home: V(-5, 0, -8), yaw: 1.3, pose: 'lie', exit: [V(-8, 0, -22), V(-12, 0, -56)], spd: 8, g: 'camel' }
      ];
    }
  },
  // ---------------- شاطئ رأس الجنز ----------------
  {
    id: 'beach', ar: 'شاطئ رأس الجنز', em: '🐢', desc: 'سلاحف بحرية وصغارها وسرطانات ونوارس وفلامنغو ودلافين',
    sky: 'noon', fog: [0xcff0ff, 90, 420], sun: [.4, .7, .5],
    rare: { ar: 'الحوت الأحدب', em: '🐋', msg: 'حوت بحر العرب الأحدب يقفز فرحًا بهدوئكم!' },
    build(S, Q) { return buildBeachWorld(S, Q); },
    order: ['rare', 'gull', 'fla', 'dol', 'cr1', 'her', 'hatch', 'tu1', 'cr2', 'tu2'],
    agents(W) {
      const Y = W.H, sea = (x, z) => [V(x, 0, -11), V(x * .8, 0, -22)];
      return [
        { id: 'wh', ar: 'الحوت الأحدب', em: '🐋', b: buildWhale, home: V(-14, -1.6, -62), yaw: 1.2, rare: true, fly: true, up: -2, wander: { r: [10, 0, 5], w: .08 }, leap: { h: 7, every: 9 }, exit: [V(-70, -8, -120)], spd: 8, g: 'rare', sc: 1.6 },
        ...[[-1.5, -2.8], [1.4, -4.4], [3.8, -3]].map(([x, z], i) => ({ id: 'gl' + i, ar: 'النورس', em: '🕊️', b: () => buildBird('gull'), home: V(x, 0, z), yaw: i - 1, fly: true, exit: [V(-30 + i * 22, 22, -40)], spd: 13, g: 'gull' })),
        ...[[10, -10.4], [12, -11.3], [13.6, -9.8]].map(([x, z], i) => ({ id: 'fl' + i, ar: 'الفلامنغو', em: '🦩', b: () => buildBird('flamingo'), home: V(x, 0, z), yaw: -.5 + i * .4, fly: true, exit: [V(40, 20, -50)], spd: 11, g: 'fla' })),
        ...[[-6, -28], [3, -32]].map(([x, z], i) => ({ id: 'dl' + i, ar: 'الدلفين', em: '🐬', b: buildDolphin, home: V(x, -.7, z), yaw: 1.5, fly: true, up: -3, wander: { r: [7, 0, 3], w: .22 }, leap: { h: 3.2, every: 4 + i * 1.3 }, exit: [V(x * 3, -6, -90)], spd: 14, g: 'dol' })),
        ...[[-8, 5.2], [-6.2, 8]].map(([x, z], i) => ({ id: 'ca' + i, ar: 'السرطان', em: '🦀', b: () => buildCrab(), home: V(x, 0, z), yaw: .3, side: true, exit: [V(x - 4, 0, z + .5)], hole: true, spd: 6, g: 'cr1' })),
        { id: 'her', ar: 'البلشون', em: '🪶', b: () => buildBird('heron'), home: V(-11, 0, -8.6), yaw: 1.4, fly: true, exit: [V(-40, 24, -36)], spd: 11, g: 'her' },
        ...[[2.5, 8.5], [3.6, 9.4], [4.4, 8.2], [5.5, 9.2]].map(([x, z], i) => ({ id: 'ht' + i, ar: 'صغار السلاحف', em: '🐢', b: buildSeaTurtle, sc: .45, home: V(x, 0, z), yaw: Math.PI + (i - 1.5) * .2, exit: [V(x - 1, 0, -10), V(x - 2, 0, -18)], spd: 4.5, g: 'hatch' })),
        { id: 'tu1', ar: 'السلحفاة الخضراء', em: '🐢', b: buildSeaTurtle, sc: 2.1, home: V(-3, 0, 1.5), yaw: .5, exit: [V(-4, 0, -11), V(-6, 0, -20)], spd: 3.5, g: 'tu1' },
        ...[[9.5, 8.5], [11.4, 5.8]].map(([x, z], i) => ({ id: 'cb' + i, ar: 'السرطان', em: '🦀', b: () => buildCrab(0xf2c040), home: V(x, 0, z), yaw: -.4, side: true, exit: [V(x + 4, 0, z + .5)], hole: true, spd: 6, g: 'cr2' })),
        { id: 'tu2', ar: 'السلحفاة', em: '🐢', b: buildSeaTurtle, sc: 1.9, home: V(8, 0, 2.5), yaw: -.6, exit: [V(9, 0, -11), V(10, 0, -20)], spd: 3.5, g: 'tu2' }
      ];
    }
  },
  // ---------------- أعماق جزر الديمانيات ----------------
  {
    id: 'reef', ar: 'أعماق الديمانيات', em: '🐠', desc: 'شعاب مرجانية وأسماك ملوّنة وأخطبوط وفرس البحر تحت الماء',
    under: true, bg: [0x0a5aa8, 0x2ab8e8], fog: [0x1a8fd0, .028], sun: [.2, 1, .3],
    cam: [V(0, 6.2, 24), V(0, 3.2, -4)],
    rare: { ar: 'القرش الحوتي', em: '🦈', msg: 'أكبر سمكة في العالم — لطيف ولا يؤذي، جاء لأن البحر هادئ!' },
    build(S, Q) { return buildReefWorld(S, Q); },
    order: ['rare', 'sch', 'bfy', 'tang', 'puf', 'par', 'clown', 'stu', 'ray', 'sh', 'oct'],
    agents(W) {
      const Y = W.H, sw = (o) => Object.assign({ fly: true, swim3: true, up: 2.5, wander: { r: [1.6, .5, 1.2], w: .5 }, spd: 9 }, o), a = W.anemone.position;
      return [
        sw({ id: 'ws', ar: 'القرش الحوتي', em: '🦈', b: buildWhaleShark, sc: 1.5, home: V(-6, 8, -24), yaw: 1.4, rare: true, wander: { r: [16, 1.5, 4], w: .07 }, exit: [V(-70, 10, -70)], spd: 7, g: 'rare' }),
        sw({ id: 'sch', ar: 'سرب الأسماك', em: '🐟', b: () => buildSchool(12), sc: 1.6, home: V(6, 5.5, -5), yaw: -1, wander: { r: [4, 1, 2.5], w: .35 }, exit: [V(40, 10, -40)], spd: 14, g: 'sch' }),
        ...[[-8, 3, -3], [-6.6, 3.8, -2]].map(([x, y, z], i) => sw({ id: 'bf' + i, ar: 'سمكة الفراشة', em: '🐠', b: () => buildFish(FISH.butterfly), sc: 2.4, home: V(x, y, z), yaw: 1, exit: [V(-40, 8, -30)], g: 'bfy' })),
        sw({ id: 'tang', ar: 'سمكة الجرّاح الزرقاء', em: '🐟', b: () => buildFish(FISH.tang), sc: 2.4, home: V(3, 3.4, 4), yaw: -1.2, exit: [V(36, 6, -20)], g: 'tang' }),
        sw({ id: 'puf', ar: 'السمكة النفّاخة', em: '🐡', b: buildPuffer, sc: 1.8, home: V(.5, 2.6, 1), yaw: .3, wander: { r: [1, .4, .8], w: .3 }, exit: [V(-10, 4, -40)], spd: 5, g: 'puf' }),
        sw({ id: 'par', ar: 'سمكة الببغاء', em: '🐟', b: () => buildFish(FISH.parrot), sc: 2.2, home: V(9, 2.2, -5), yaw: -1.6, exit: [V(40, 4, -30)], g: 'par' }),
        ...[0, 1].map(i => sw({ id: 'cl' + i, ar: 'سمكة المهرج', em: '🐠', b: () => buildFish(FISH.clown), sc: 2.2, home: V(a.x + (i ? .8 : -.6), a.y + 1.9 + i * .4, a.z + .3), yaw: i ? -1 : 1, wander: { r: [.7, .25, .5], w: .7 }, hider: true, g: 'clown' })),
        sw({ id: 'stu', ar: 'السلحفاة البحرية', em: '🐢', b: buildSeaTurtle, sc: 1.8, home: V(-11, 6, -9), yaw: 1.3, wander: { r: [4, 1, 2], w: .15 }, exit: [V(-45, 12, -40)], spd: 7, g: 'stu', swimGait: true }),
        sw({ id: 'ray', ar: 'اللخمة', em: '🐟', b: buildRay, sc: 1.8, home: V(-1, Y(-1, -6) + .7, -6), yaw: .8, wander: { r: [3, .2, 1.5], w: .2 }, exit: [V(-30, 2, -40)], spd: 8, g: 'ray' }),
        ...[[11.5, 2.2, 4.5], [12.6, 2.6, 3.4]].map(([x, y, z], i) => sw({ id: 'sh' + i, ar: 'فرس البحر', em: '🐴', b: buildSeahorse, sc: 1.5, home: V(x, y, z), yaw: -.8, wander: { r: [.15, .2, .15], w: .3 }, hider: true, g: 'sh' })),
        { id: 'oct', ar: 'الأخطبوط', em: '🐙', b: buildOctopus, sc: 1.6, home: V(5.2, Y(5.2, -3) + .1, -3), yaw: -.4, hider: true, g: 'oct' }
      ];
    }
  },
  // ---------------- الجبل الأخضر ----------------
  {
    id: 'mountain', ar: 'الجبل الأخضر', em: '🐐', desc: 'مدرجات الرمان والورد والفلج، وماعز وحمار وديك وقطة',
    sky: 'morning', fog: [0xbfe8ff, 90, 320], sun: [-.5, .65, .45],
    rare: { ar: 'الطهر العربي', em: '🐐', msg: 'الطهر العربي النادر نزل من الجبل لأنكم هادئون!' },
    build(S, Q) { return buildMountainWorld(S, Q); },
    order: ['rare', 'eag', 'bfly', 'par', 'hen', 'roo', 'cat', 'kid', 'gt2', 'gt1', 'don', 'gt3'],
    agents(W) {
      const Y = W.H;
      return [
        { id: 'tahr', ar: 'الطهر العربي', em: '🐐', b: buildTahr, home: V(6, 0, -15), yaw: -.6, rare: true, exit: [V(10, 0, -30), V(14, 0, -60)], spd: 9, g: 'rare' },
        { id: 'eag', ar: 'النسر', em: '🦅', b: () => buildBird('eagle'), home: V(0, 20, -18), yaw: 0, fly: true, wander: { r: [14, 2, 6], w: .2 }, idleGait: 'fly', exit: [V(60, 40, -70)], spd: 16, g: 'eag' },
        ...flies(4, -7, 4, 4.2),
        ...[[10.5, -2.5], [12, -1.2]].map(([x, z], i) => ({ id: 'pr' + i, ar: 'الحجل', em: '🐦', b: () => buildBird('partridge'), home: V(x, 0, z), yaw: -1 + i, exit: [V(x + 10, 0, z + 4), V(44, 0, z)], spd: 9, g: 'par' })),
        ...[[2.6, 7.3], [-.8, 7.8]].map(([x, z], i) => ({ id: 'hn' + i, ar: 'الدجاج', em: '🐔', b: () => buildBird('hen'), home: V(x, 0, z), yaw: i ? .6 : -.8, exit: [V(x * 3 + (i ? -10 : 10), 0, 10), V(i ? -44 : 44, 0, 12)], spd: 9, g: 'hen' })),
        { id: 'roo', ar: 'الديك', em: '🐓', b: () => buildBird('rooster'), home: V(1, 0, 5.6), yaw: .2, exit: [V(12, 0, 8), V(44, 0, 9)], spd: 9, g: 'roo' },
        { id: 'cat', ar: 'القطة', em: '🐈', b: buildCat, home: V(-5, 0, 8.4), yaw: .5, pose: 'sit', exit: [V(-16, 0, 9), V(-44, 0, 10)], spd: 11, g: 'cat' },
        { id: 'kid', ar: 'الجدي الصغير', em: '🐐', b: () => buildGoat(0xf4f0e8, 0xc8a07a, true), sc: 1.1, home: V(6.5, 0, 3.5), yaw: -1, exit: [V(16, 0, 4), V(44, 0, 2)], spd: 11, g: 'kid', bound: true },
        { id: 'gt2', ar: 'الماعز', em: '🐐', b: () => buildGoat(0xf4f0e8, 0x8a6a4a), home: V(4.2, 0, .5), yaw: -2, pose: 'graze', exit: [V(14, 0, -2), V(44, 0, -4)], spd: 11, g: 'gt2' },
        { id: 'gt1', ar: 'الماعز الأسود', em: '🐐', b: () => buildGoat(0x3a3234, 0xffffff), home: V(-3.5, 0, -1.5), yaw: 1.3, pose: 'graze', exit: [V(-14, 0, -3), V(-44, 0, -5)], spd: 11, g: 'gt1' },
        { id: 'don', ar: 'الحمار', em: '🫏', b: buildDonkey, home: V(-9.5, 0, 3.5), yaw: 1.0, pose: 'graze', exit: [V(-20, 0, 5), V(-46, 0, 6)], spd: 9, g: 'don' },
        { id: 'gt3', ar: 'الماعز البني', em: '🐐', b: () => buildGoat(0x9a6a3a, 0xffffff), home: V(-8.5, 0, -10), yaw: .7, exit: [V(-14, 0, -22), V(-20, 0, -50)], spd: 10, g: 'gt3' }
      ];
    }
  }
];
