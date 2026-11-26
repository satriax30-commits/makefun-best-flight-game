// The cockpit instruments, drawn on a 2D canvas over the 3D view: artificial horizon,
// airspeed and altitude tapes, heading tape, vertical speed, fuel, throttle, flaps and
// gear lights, ring progress and the mission clock. Everything a pilot reads, lit.
const MS_TO_KT = 1.94384;
const M_TO_FT = 3.28084;

/** Fit the HUD canvas to the window; call on resize. */
export function createHud(canvas) {
  const ctx = canvas.getContext('2d');
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(8, 16, 28, 0.62)';
    ctx.strokeStyle = 'rgba(127, 212, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
  }

  function text(str, x, y, size, color, align = 'left', bold = true) {
    ctx.font = `${bold ? '700' : '400'} ${size}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
  }

  /** The artificial horizon: a rolling, pitching sky/ground disc with a pitch ladder. */
  function drawHorizon(cx, cy, radius, pitch, roll) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(roll);
    const pitchPx = pitch * (radius / 0.6);
    ctx.fillStyle = '#2f6fb2';
    ctx.fillRect(-radius, -radius - pitchPx, radius * 2, radius + pitchPx);
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(-radius, -pitchPx, radius * 2, radius + pitchPx);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-radius, -pitchPx);
    ctx.lineTo(radius, -pitchPx);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    for (const deg of [-20, -10, 10, 20]) {
      const y = -pitchPx - Math.tan((deg * Math.PI) / 180) * (radius / 0.6);
      const w = deg % 20 === 0 ? 46 : 28;
      ctx.beginPath();
      ctx.moveTo(-w / 2, y);
      ctx.lineTo(w / 2, y);
      ctx.stroke();
      text(`${Math.abs(deg)}`, -w / 2 - 6, y, 11, '#ffffff', 'right', false);
      text(`${Math.abs(deg)}`, w / 2 + 6, y, 11, '#ffffff', 'left', false);
    }
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 34, cy);
    ctx.lineTo(cx - 10, cy);
    ctx.moveTo(cx + 10, cy);
    ctx.lineTo(cx + 34, cy);
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd166';
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(127,212,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    // Roll pointer on top.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(roll);
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(0, -radius - 2);
    ctx.lineTo(-7, -radius - 14);
    ctx.lineTo(7, -radius - 14);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** A vertical tape: the value in the middle, neighbours fading above and below. */
  function drawTape(x, y, w, h, value, step, unit, format) {
    panel(x, y, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    const pxPerUnit = (h - 40) / (step * 4);
    const centre = y + h / 2;
    const base = Math.floor(value / step) * step;
    for (let v = base - step * 4; v <= base + step * 4; v += step) {
      const yy = centre - (v - value) * pxPerUnit;
      if (yy < y + 8 || yy > y + h - 8) continue;
      const major = v % (step * 5) === 0;
      ctx.strokeStyle = major ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x + w - 14, yy);
      ctx.lineTo(x + w - 4, yy);
      ctx.stroke();
      if (major) text(format(v), x + w - 18, yy, 12, '#e8f1fb', 'right', false);
    }
    ctx.restore();
    ctx.fillStyle = '#0e1a2e';
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(x - 4, centre - 15, w + 8, 30);
    ctx.fill();
    ctx.stroke();
    text(format(value), x + w / 2, centre, 17, '#ffd166', 'center');
    text(unit, x + w / 2, y + h - 12, 11, '#9fc3e8', 'center', false);
  }

  /** The heading tape across the top, with compass points. */
  function drawHeadingTape(w, heading) {
    const y = 14; const h = 34;
    panel(w / 2 - 210, y, 420, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(w / 2 - 210, y, 420, h);
    ctx.clip();
    const pxPerDeg = 4.4;
    const cx = w / 2;
    const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let d = Math.floor((heading - 50) / 5) * 5; d <= heading + 50; d += 5) {
      const dd = ((d % 360) + 360) % 360;
      const xx = cx + (d - heading) * pxPerDeg;
      if (xx < cx - 210 || xx > cx + 210) continue;
      const major = dd % 45 === 0;
      ctx.strokeStyle = major ? '#ffffff' : 'rgba(255,255,255,0.4)';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(xx, y + h - 8);
      ctx.lineTo(xx, y + h - (major ? 18 : 12));
      ctx.stroke();
      if (dd % 15 === 0) {
        text(names[dd] ?? String(dd), xx, y + 13, major ? 14 : 11, major ? '#ffd166' : '#9fc3e8', 'center');
      }
    }
    ctx.restore();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(cx - 7, y + h + 2);
    ctx.lineTo(cx + 7, y + h + 2);
    ctx.lineTo(cx, y + h + 10);
    ctx.closePath();
    ctx.fill();
    text(`${String(Math.round(heading)).padStart(3, '0')}°`, cx, y + h + 26, 15, '#ffd166', 'center');
  }

  function drawGauge(x, y, w, h, fraction, label, color, valueText) {
    text(label, x, y - 9, 11, '#9fc3e8', 'left', false);
    panel(x, y, w, h);
    const fw = Math.max(0, Math.min(1, fraction)) * (w - 4);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x + 2, y + 2, Math.max(2, fw), h - 4, 4);
    ctx.fill();
    if (valueText) text(valueText, x + w + 8, y + h / 2, 13, '#e8f1fb', 'left');
  }

  function drawLight(x, y, label, on, color) {
    ctx.fillStyle = on ? color : 'rgba(120,130,140,0.35)';
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    text(label, x + 12, y, 12, on ? '#e8f1fb' : '#6f8fb5', 'left', false);
  }

  return {
    /**
     * Paint the instruments for `flight` (the flight state) and `info`:
     * { route, aircraft, ringsPassed, ringsTotal, message, messageUntil, windFrom,
     * windSpeed, nextName, nextDist, showInstruments }.
     */
    draw(flight, info, now) {
      const w = window.innerWidth; const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      if (!info.showInstruments) return;
      const speedKt = flight.speed * MS_TO_KT;
      const altFt = Math.max(0, (flight.y - 0) * M_TO_FT);
      const vsFpm = flight.verticalSpeed * M_TO_FT * 60;

      drawHeadingTape(w, flight.headingDeg);
      drawTape(16, h / 2 - 130, 86, 260, speedKt, 10, 'KT', (v) => String(Math.round(v)));
      drawTape(w - 102, h / 2 - 130, 86, 260, altFt, 100, 'FT', (v) => String(Math.round(v)));
      drawHorizon(w / 2, h - 150, 62, flight.pitch, flight.roll);

      // Bottom-left cluster: throttle, fuel, flaps, gear, stall warning.
      const bx = 16; const by = h - 108;
      drawGauge(bx, by, 150, 14, flight.throttle, 'THR', '#7fd4ff', `${Math.round(flight.throttle * 100)}%`);
      const fuelFrac = flight.fuel / info.aircraft.fuel;
      drawGauge(bx, by + 34, 150, 14, fuelFrac, 'FUEL', fuelFrac < 0.2 ? '#ff8a7a' : '#7be495', `${Math.round(flight.fuel)} L`);
      drawLight(bx + 8, by + 66, 'FLAPS', flight.flaps > 0.5, '#ffd166');
      drawLight(bx + 92, by + 66, 'GEAR', flight.gearDown, '#7be495');
      const stallSpeed = info.aircraft.stall * (1 - flight.flaps * 0.28);
      if (!flight.onGround && flight.speed < stallSpeed + 3) {
        text('STALL', bx + 170, by + 66, 16, (now * 4) % 1 < 0.5 ? '#ff5a4a' : '#ffd166', 'left');
      }

      // Bottom-right cluster: vertical speed, wind, mission.
      const rx = w - 216;
      text(`V/S  ${vsFpm >= 0 ? '+' : ''}${Math.round(vsFpm)} ft/min`, rx, h - 92, 14, '#e8f1fb', 'left');
      const windArrow = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'][Math.round(((info.windFrom + 180) % 360) / 45) % 8];
      text(`WIND ${windArrow} ${Math.round(info.windSpeed)} m/s`, rx, h - 66, 14, '#9fc3e8', 'left', false);
      text(info.route ? info.route.name : 'FREE FLIGHT', rx, h - 40, 15, '#ffd166', 'left');
      if (info.ringsTotal > 0) {
        text(`RINGS  ${info.ringsPassed}/${info.ringsTotal}`, rx, h - 16, 14, '#e8f1fb', 'left');
      }
      if (info.nextName) {
        text(`NEXT  ${info.nextName}  ${(info.nextDist / 1000).toFixed(1)} km`, w / 2, 108, 15, '#e8f1fb', 'center');
      }
      const mins = Math.floor(flight.time / 60);
      const secs = Math.floor(flight.time % 60);
      text(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`, w - 16, 84, 16, '#e8f1fb', 'right');

      // Centre banner message.
      if (info.message && now < info.messageUntil) {
        ctx.font = '700 30px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(8,16,28,0.6)';
        const mw = ctx.measureText(info.message).width + 44;
        ctx.beginPath();
        ctx.roundRect(w / 2 - mw / 2, h * 0.3 - 26, mw, 52, 10);
        ctx.fill();
        ctx.fillStyle = info.messageColor ?? '#ffd166';
        ctx.fillText(info.message, w / 2, h * 0.3);
      }
    },
  };
}
