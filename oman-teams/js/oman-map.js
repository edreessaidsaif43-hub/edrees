/* خريطة عُمان المصوّرة ومحطات الرحلة (الإحداثيات بوحدات الصورة 1024×1536) */
(function () {
  var W = 1024, H = 1536;
  // المحطات بالترتيب: من مسقط حتى خصب. ev: star(+1) / storm(−1) / gift(سؤال إضافي). l: إزاحة الاسم
  var STATIONS = [
    { n: 'مسقط', x: 800, y: 400, start: true, l: [0, 44] },
    { n: 'قريات', x: 770, y: 478, l: [-52, 6] },
    { n: 'وادي شاب', x: 640, y: 548, l: [0, 40] },
    { n: 'صور', x: 845, y: 600, ev: 'star', l: [0, 40] },
    { n: 'رأس الحد', x: 930, y: 660, l: [0, 40] },
    { n: 'جعلان', x: 795, y: 770, ev: 'gift', l: [0, 42] },
    { n: 'مصيرة', x: 880, y: 965, sea: true, l: [0, 42] },
    { n: 'الدقم', x: 760, y: 905, ev: 'storm', l: [-48, 6] },
    { n: 'حاسك', x: 690, y: 1080, l: [0, 40] },
    { n: 'مرباط', x: 565, y: 1235, ev: 'star', l: [0, 40] },
    { n: 'صلالة', x: 390, y: 1320, ev: 'gift', l: [0, 42] },
    { n: 'ثمريت', x: 300, y: 1000, l: [0, 40] },
    { n: 'هيماء', x: 430, y: 790, ev: 'storm', l: [0, 40] },
    { n: 'أدم', x: 520, y: 900, l: [0, 40] },
    { n: 'نزوى', x: 585, y: 700, ev: 'star', l: [0, 40] },
    { n: 'جبل شمس', x: 430, y: 455, ev: 'gift', l: [0, 42] },
    { n: 'عبري', x: 390, y: 580, l: [0, 40] },
    { n: 'الرستاق', x: 540, y: 365, l: [0, 40] },
    { n: 'بركاء', x: 720, y: 335, ev: 'star', l: [52, 6] },
    { n: 'صحار', x: 650, y: 268, ev: 'storm', l: [-48, 6] },
    { n: 'شناص', x: 600, y: 190, l: [-50, 6] },
    { n: 'خصب', x: 622, y: 52, finish: true, sea: true, l: [62, 8] }
  ];
  var ICON = { star: '⭐', storm: '🌪', gift: '🎁' };

  function base() {
    var h = '';
    h += '<defs><filter id="sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="4" stdDeviation="3" flood-opacity=".35"/></filter></defs>';
    h += '<image href="assets/map/oman-map.jpg" x="0" y="0" width="' + W + '" height="' + H + '" preserveAspectRatio="xMidYMid meet"/>';
    // الطريق
    var d = '', seaD = [];
    for (var i = 1; i < STATIONS.length; i++) {
      var a = STATIONS[i - 1], b = STATIONS[i];
      var seg = 'M' + a.x + ' ' + a.y + ' L' + b.x + ' ' + b.y + ' ';
      if (b.sea) seaD.push(seg); else d += seg;
    }
    h += '<path d="' + d + '" stroke="#5b3416" stroke-width="12" stroke-linecap="round" fill="none" opacity=".45"/>';
    h += '<path d="' + d + '" stroke="#fff7df" stroke-width="5" stroke-dasharray="3 12" stroke-linecap="round" fill="none"/>';
    h += '<path d="' + seaD.join(' ') + '" stroke="#ffffff" stroke-width="6" stroke-dasharray="14 12" stroke-linecap="round" fill="none" opacity=".95"/>';
    // المحطات
    STATIONS.forEach(function (s, i) {
      var r = s.start || s.finish ? 30 : 23;
      var fill = s.start ? '#16a3a0' : s.finish ? '#e53950' : s.ev === 'star' ? '#ffd23f' : s.ev === 'storm' ? '#8c96a8' : s.ev === 'gift' ? '#c27cf0' : '#ffffff';
      h += '<g class="st" data-i="' + i + '" filter="url(#sh)"><circle cx="' + s.x + '" cy="' + s.y + '" r="' + r + '" fill="' + fill + '" stroke="#1d2b53" stroke-width="4"/>';
      h += '<text x="' + s.x + '" y="' + (s.y + 8) + '" font-size="' + (s.ev || s.start || s.finish ? 24 : 22) + '" font-weight="900" text-anchor="middle" fill="' + (s.start || s.finish ? '#fff' : '#1d2b53') + '">' + (s.start ? '▶' : s.finish ? '🏁' : s.ev ? ICON[s.ev] : i) + '</text>';
      var L = s.l || [0, 40];
      h += '<text x="' + (s.x + L[0]) + '" y="' + (s.y + L[1] + 6) + '" font-size="24" font-weight="900" text-anchor="middle" fill="#1d2b53" stroke="#fffaf0" stroke-width="7" paint-order="stroke" stroke-linejoin="round">' + s.n + '</text></g>';
    });
    h += '<g id="tokens"></g>';
    return h;
  }

  window.OmanMap = { STATIONS: STATIONS, ICON: ICON, base: base, W: W, H: H };
})();
