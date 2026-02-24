let pilots = [];
let atcs = []; // New state for ATC
const icaoInput = document.getElementById("icao-filter");
const atcList = document.getElementById("atc-list");
icaoInput.value = localStorage.getItem("v16_icao") || "";

function save(cs, field, val) {
  localStorage.setItem(`v16_${cs}_${field}`, val.toUpperCase());
  render();
}
function get(cs, field) {
  return localStorage.getItem(`v16_${cs}_${field}`) || "";
}

// Hide/Delete functionality
function hideFlight(cs) {
  let hidden = JSON.parse(localStorage.getItem("v16_hidden") || "[]");
  if (!hidden.includes(cs)) hidden.push(cs);
  localStorage.setItem("v16_hidden", JSON.stringify(hidden));
  render();
}
function clearHidden() {
  localStorage.setItem("v16_hidden", "[]");
  render();
}

async function sync() {
  try {
    const res = await fetch("https://api.ivao.aero/v2/tracker/whazzup");
    const data = await res.json();

    pilots = data.clients.pilots;
    atcs = data.clients.atcs; // Capture ATC data

    render();
  } catch (e) {
    console.warn("API Offline");
  }
}

function formatIVAOTime(seconds) {
  if (!seconds) return "----";
  // Handle 24-hour rollover
  const totalMinutes = Math.floor(seconds / 60) % 1440;
  const h = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (totalMinutes % 60).toString().padStart(2, "0");
  return `${h}${m}`;
}

function buildStrip(p, role) {
  const cs = p.callsign;
  const fp = p.flightPlan;
  const tr = p.lastTrack || { transponder: "0000" };
  const curBay = get(cs, "bay") || (role === "departure" ? "DEL" : "APP");
  const assignedSqk = get(cs, "asqk");
  const isSqkMismatch =
    assignedSqk && assignedSqk !== tr.transponder.toString();

  const div = document.createElement("div");
  const arrivalSeconds = (fp.actualDepartureTime || fp.departureTime) + fp.eet;
  div.className = `strip ${role}`;
  div.innerHTML = `
          <button class="btn-del" onclick="hideFlight('${cs}')">✕</button>
          <div class="c-sidebar">
            ${["DEL", "TAX", "TWR", "APP"].map((b) => `<button class="m-btn ${curBay === b ? "active" : ""}" onclick="save('${cs}','bay','${b}')">${b}</button>`).join("")}
          </div>
          <div class="c-body">
            <div class="row-top">
              <div class="c-cs"><span class="label">Callsign</span>${cs}</div>
               <div class="c-type">
                <span class="label">Route</span>
                ${fp.departureId} → ${fp.arrivalId} | ALTN: ${fp.alternativeId || "N/A"}
              </div>
              <div class="c-type">
                <span class="label">CTOT Slot</span>
                ${formatIVAOTime(fp.departureTime)}Z
              </div>
              <div class="c-type">
                <span class="label">ETA</span>
                ${formatIVAOTime(arrivalSeconds)}Z
              </div>
              <div class="c-type"><span class="label">ACFT</span>${fp.aircraft?.icaoCode || "UNK"}/${fp.aircraft?.wakeTurbulence || "M"}</div>
            </div>
            <div class="c-route"><span class="label">Route</span>${fp.route || "—"}</div>
            <div class="c-rmk"><span class="label">Remarks</span>${fp.remarks || "—"}</div>
            <div class="row-bottom">
              <div class="c-sid"><span class="label">PROC</span><input class="edit" value="${get(cs, "sid")}" onchange="save('${cs}','sid',this.value)"></div>
              <div class="c-sqk ${isSqkMismatch ? "sqk-alert" : ""}">
                <span class="label">SSR</span><div style="font-size:11px; font-weight:800">${tr.transponder}</div>
                <input class="edit" style="font-size:10px" value="${assignedSqk}" placeholder="SET" onchange="save('${cs}','asqk',this.value)">
              </div>
              <div class="c-stand"><span class="label">GATE</span><input class="edit" value="${get(cs, "std")}" onchange="save('${cs}','std',this.value)"></div>
            </div>
          </div>
          <div class="c-cfl"><span class="label">CFL</span><input class="edit" value="${get(cs, "cfl")}" placeholder="---" onchange="save('${cs}','cfl',this.value)"></div>
        `;
  return div;
}

function render() {
  const myIcao = icaoInput.value.toUpperCase();
  localStorage.setItem("v16_icao", myIcao);
  const prefix = myIcao.substring(0, 2); // Get first two letters (e.g., "EG")
  const hidden = JSON.parse(localStorage.getItem("v16_hidden") || "[]");

  // 1. Render ATC Bar
  atcList.innerHTML = "";
  if (myIcao.length >= 2) {
    const localAtc = atcs.filter((a) => a.callsign.startsWith(prefix));

    if (localAtc.length === 0) {
      atcList.innerHTML = `<span style="color: #555 italic">No local ATC online</span>`;
    } else {
      localAtc.forEach((a) => {
        const span = document.createElement("span");
        span.style.cssText =
          "background: #222; padding: 2px 8px; border-radius: 3px; border: 1px solid #444; color: #0f0;";
        span.innerHTML = `<strong>${a.callsign}</strong> <small style="color: #aaa">${a.atcSession.frequency}</small>`;
        atcList.appendChild(span);
      });
    }
  }

  // 2. Render Strips
  const bays = ["DEL", "TAX", "TWR", "APP"];
  bays.forEach((b) => (document.getElementById(`bay-${b}`).innerHTML = ""));

  pilots.forEach((p) => {
    if (!p.flightPlan || !myIcao || hidden.includes(p.callsign)) return;
    if (
      p.flightPlan.departureId !== myIcao &&
      p.flightPlan.arrivalId !== myIcao
    )
      return;

    const isDep = p.flightPlan.departureId === myIcao;
    const target = get(p.callsign, "bay") || (isDep ? "DEL" : "APP");
    const list = document.getElementById(`bay-${target}`);
    if (list) list.appendChild(buildStrip(p, isDep ? "departure" : "arrival"));
  });

  // 3. Handle Auto-Collapse
  bays.forEach((id) => {
    const list = document.getElementById(`bay-${id}`);
    const parent = document.getElementById(`parent-${id}`);
    list.children.length === 0
      ? parent.classList.add("collapsed")
      : parent.classList.remove("collapsed");
  });

  // 4. Render Bookings Table
  const bookingsList = document.getElementById("bookings-list");
  bookingsList.innerHTML = "";

  const relevantPilots = pilots.filter((p) => {
    if (!p.flightPlan || !myIcao) return false;
    return (
      p.flightPlan.departureId === myIcao || p.flightPlan.arrivalId === myIcao
    );
  });

  if (relevantPilots.length === 0) {
    bookingsList.innerHTML = `<tr><td colspan="7" style="padding: 20px; text-align: center; color: #555;">No bookings found for ${myIcao}</td></tr>`;
  } else {
    relevantPilots.forEach((p) => {
      const fp = p.flightPlan;
      const isDep = fp.departureId === myIcao;
      const arrivalSeconds =
        (fp.actualDepartureTime || fp.departureTime) + fp.eet;

      const tr = document.createElement("tr");
      tr.style.borderBottom = "1px solid #222";
      tr.style.color = isDep ? "var(--dep-blue)" : "var(--arr-pink)";

      tr.innerHTML = `
        <td style="padding: 10px; font-weight: bold;">${p.callsign}</td>
        <td style="padding: 10px;">${isDep ? "DEPARTURE" : "ARRIVAL"}</td>
        <td style="padding: 10px;">${fp.aircraft?.icaoCode || "---"}</td>
        <td style="padding: 10px;">${formatIVAOTime(fp.departureTime)}Z</td>
        <td style="padding: 10px;">${formatIVAOTime(arrivalSeconds)}Z</td>
        <td style="padding: 10px;">${fp.departureId}</td>
        <td style="padding: 10px;">${fp.arrivalId}</td>
      `;
      bookingsList.appendChild(tr);
    });
  }
}

icaoInput.oninput = render;
setInterval(sync, 15000);
sync();
