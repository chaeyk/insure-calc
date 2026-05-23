const defaults = {
  monthlyPremium: 1000000,
  insurancePayout: 1147500,
  payStartAge: 46,
  payYears: 10,
  receiveStartAge: 66,
  receiveEndAge: 100,
  depositRate: 3.5,
  taxRate: 15,
};

const ids = Object.keys(defaults);
const inputs = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
const output = {
  validationMessage: document.getElementById("validationMessage"),
  equivalentRate: document.getElementById("equivalentRate"),
  depletionAge: document.getElementById("depletionAge"),
  depletionDetail: document.getElementById("depletionDetail"),
  matchedDepositPayout: document.getElementById("matchedDepositPayout"),
  matchedDetail: document.getElementById("matchedDetail"),
  totalPaid: document.getElementById("totalPaid"),
  totalPaidDetail: document.getElementById("totalPaidDetail"),
  insuranceTotalReceived: document.getElementById("insuranceTotalReceived"),
  insuranceTotalDetail: document.getElementById("insuranceTotalDetail"),
  depositTotalReceived: document.getElementById("depositTotalReceived"),
  depositTotalDetail: document.getElementById("depositTotalDetail"),
  insuranceReserve: document.getElementById("insuranceReserve"),
  insuranceReserveDetail: document.getElementById("insuranceReserveDetail"),
  depositStartBalance: document.getElementById("depositStartBalance"),
  depositStartBalanceDetail: document.getElementById("depositStartBalanceDetail"),
  reserveGap: document.getElementById("reserveGap"),
  reserveGapDetail: document.getElementById("reserveGapDetail"),
  chart: document.getElementById("balanceChart"),
};

const krw = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

const number = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 1,
});

function readValues() {
  return Object.fromEntries(ids.map((id) => [id, Number(inputs[id].value)]));
}

function validate(v) {
  const payEndAge = v.payStartAge + v.payYears;
  if (Object.values(v).some((value) => !Number.isFinite(value))) return "모든 값을 숫자로 입력하세요.";
  if (v.monthlyPremium <= 0 || v.insurancePayout <= 0) return "월 납입액과 월 수령액은 0보다 커야 합니다.";
  if (v.payYears <= 0) return "납입 기간은 1년 이상이어야 합니다.";
  if (v.receiveStartAge < payEndAge) return `수령 시작 나이는 납입 종료 나이(${payEndAge}세) 이후여야 합니다.`;
  if (v.receiveEndAge <= v.receiveStartAge) return "수령 종료 나이는 수령 시작 나이보다 커야 합니다.";
  if (v.depositRate < 0 || v.taxRate < 0 || v.taxRate >= 100) {
    return "금리와 세율 범위를 확인하세요.";
  }
  return "";
}

function monthsBetween(startAge, endAge) {
  return Math.round((endAge - startAge) * 12);
}

function monthlyNetRate(annualGrossPercent, taxPercent) {
  const grossMonthly = Math.pow(1 + annualGrossPercent / 100, 1 / 12) - 1;
  return grossMonthly * (1 - taxPercent / 100);
}

function buildBalanceSeries(v, annualGrossPercent, monthlyWithdrawal) {
  const monthlyRate = monthlyNetRate(annualGrossPercent, v.taxRate);
  const payMonths = Math.round(v.payYears * 12);
  const deferMonths = monthsBetween(v.payStartAge + v.payYears, v.receiveStartAge);
  const receiveMonths = monthsBetween(v.receiveStartAge, v.receiveEndAge);
  const rows = [{ month: 0, balance: 0 }];
  let balance = 0;
  let month = 0;

  for (let i = 0; i < payMonths; i += 1) {
    balance = balance * (1 + monthlyRate) + v.monthlyPremium;
    month += 1;
    rows.push({ month, balance: Math.max(0, balance) });
  }

  for (let i = 0; i < deferMonths; i += 1) {
    balance *= 1 + monthlyRate;
    month += 1;
    rows.push({ month, balance: Math.max(0, balance) });
  }
  const receiveStartBalance = balance;

  let depletionMonth = null;
  let received = 0;
  for (let i = 0; i < receiveMonths; i += 1) {
    const beforeWithdrawal = balance * (1 + monthlyRate);
    const actualWithdrawal = Math.min(monthlyWithdrawal, Math.max(0, beforeWithdrawal));
    received += actualWithdrawal;
    balance = beforeWithdrawal - monthlyWithdrawal;
    month += 1;
    if (balance <= 0 && depletionMonth === null) {
      depletionMonth = month;
      balance = 0;
      rows.push({ month, balance: 0 });
      break;
    }
    rows.push({ month, balance: Math.max(0, balance) });
  }

  return { rows, finalBalance: balance, depletionMonth, received, receiveStartBalance };
}

function signedFinalBalance(v, annualGrossPercent, monthlyWithdrawal) {
  const monthlyRate = monthlyNetRate(annualGrossPercent, v.taxRate);
  const payMonths = Math.round(v.payYears * 12);
  const deferMonths = monthsBetween(v.payStartAge + v.payYears, v.receiveStartAge);
  const receiveMonths = monthsBetween(v.receiveStartAge, v.receiveEndAge);
  let balance = 0;

  for (let i = 0; i < payMonths; i += 1) {
    balance = balance * (1 + monthlyRate) + v.monthlyPremium;
  }

  for (let i = 0; i < deferMonths; i += 1) {
    balance *= 1 + monthlyRate;
  }

  for (let i = 0; i < receiveMonths; i += 1) {
    balance = balance * (1 + monthlyRate) - monthlyWithdrawal;
  }

  return balance;
}

function finalBalanceForRate(v, annualGrossPercent) {
  return signedFinalBalance(v, annualGrossPercent, v.insurancePayout);
}

function solveEquivalentRate(v) {
  let low = 0;
  let high = 100;
  const atLow = finalBalanceForRate(v, low);
  const atHigh = finalBalanceForRate(v, high);

  if (atLow > 0) return { rate: 0, note: "0% 예금으로도 수령 종료 후 잔액이 남습니다." };
  if (atHigh < 0) return { rate: null, note: "연 100% 금리로도 같은 수령 조건을 만들 수 없습니다." };

  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2;
    if (finalBalanceForRate(v, mid) >= 0) high = mid;
    else low = mid;
  }

  return { rate: high, note: "" };
}

function balanceBeforeReceiving(v, annualGrossPercent) {
  const monthlyRate = monthlyNetRate(annualGrossPercent, v.taxRate);
  const payMonths = Math.round(v.payYears * 12);
  const deferMonths = monthsBetween(v.payStartAge + v.payYears, v.receiveStartAge);
  let balance = 0;

  for (let i = 0; i < payMonths; i += 1) {
    balance = balance * (1 + monthlyRate) + v.monthlyPremium;
  }
  for (let i = 0; i < deferMonths; i += 1) {
    balance *= 1 + monthlyRate;
  }

  return balance;
}

function solveMonthlyWithdrawal(v, annualGrossPercent) {
  const monthlyRate = monthlyNetRate(annualGrossPercent, v.taxRate);
  const receiveMonths = monthsBetween(v.receiveStartAge, v.receiveEndAge);
  const balance = balanceBeforeReceiving(v, annualGrossPercent);
  if (monthlyRate === 0) return balance / receiveMonths;
  return (balance * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -receiveMonths));
}

function ageFromMonth(v, month) {
  return v.payStartAge + month / 12;
}

function formatAge(age) {
  const years = Math.floor(age);
  const months = Math.round((age - years) * 12);
  if (months === 0) return `${years}세`;
  return `${years}세 ${months}개월`;
}

function renderChart(depositSeries, insuranceSeries, v) {
  const svg = output.chart;
  svg.replaceChildren();
  const width = 900;
  const height = 320;
  const pad = { top: 20, right: 26, bottom: 42, left: 78 };
  const rows = [...depositSeries.rows, ...insuranceSeries.rows];
  const maxMonth = Math.max(...rows.map((row) => row.month), 1);
  const maxBalance = Math.max(...rows.map((row) => row.balance), 1);
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  if (!rows.length) {
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", width / 2);
    text.setAttribute("y", height / 2);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("class", "empty-chart");
    text.textContent = "계산 가능한 값이 없습니다.";
    svg.append(text);
    return;
  }

  const x = (month) => pad.left + (month / maxMonth) * plotW;
  const y = (balance) => pad.top + plotH - (balance / maxBalance) * plotH;

  for (let i = 0; i <= 4; i += 1) {
    const balance = (maxBalance / 4) * i;
    const lineY = y(balance);
    svg.append(line( pad.left, lineY, width - pad.right, lineY, "grid-line"));
    const label = text(14, lineY + 4, `${number.format(balance / 100000000)}억`, "chart-label");
    svg.append(label);
  }

  svg.append(line(pad.left, pad.top, pad.left, height - pad.bottom, "axis"));
  svg.append(line(pad.left, height - pad.bottom, width - pad.right, height - pad.bottom, "axis"));

  const ageMarks = [v.payStartAge, v.payStartAge + v.payYears, v.receiveStartAge, v.receiveEndAge];
  ageMarks.forEach((age) => {
    const month = Math.max(0, Math.min(maxMonth, (age - v.payStartAge) * 12));
    const labelX = x(month);
    svg.append(line(labelX, height - pad.bottom, labelX, height - pad.bottom + 6, "axis"));
    const label = text(labelX, height - 14, `${age}세`, "chart-label");
    label.setAttribute("text-anchor", "middle");
    svg.append(label);
  });

  drawPath(svg, depositSeries.rows, x, y, "#0d766e");
  drawPath(svg, insuranceSeries.rows, x, y, "#b84f34");

  if (depositSeries.depletionMonth != null) {
    drawDepletionMarker(svg, depositSeries.depletionMonth, x, pad, height, v);
  }
}

function line(x1, y1, x2, y2, className) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "line");
  el.setAttribute("x1", x1);
  el.setAttribute("y1", y1);
  el.setAttribute("x2", x2);
  el.setAttribute("y2", y2);
  el.setAttribute("class", className);
  return el;
}

function text(x, y, value, className) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "text");
  el.setAttribute("x", x);
  el.setAttribute("y", y);
  el.setAttribute("class", className);
  el.textContent = value;
  return el;
}

function drawPath(svg, rows, x, y, stroke) {
  if (!rows.length) return;
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const d = rows.map((row, index) => `${index === 0 ? "M" : "L"} ${x(row.month).toFixed(2)} ${y(row.balance).toFixed(2)}`).join(" ");
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", stroke);
  path.setAttribute("stroke-width", "4");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
}

function drawDepletionMarker(svg, month, x, pad, height, v) {
  const markerX = x(month);
  svg.append(line(markerX, pad.top, markerX, height - pad.bottom, "depletion-marker"));

  const ageLabel = formatAge(ageFromMonth(v, month));
  const label = `소진 ${ageLabel}`;
  const boxWidth = Math.max(92, label.length * 12);
  const boxHeight = 28;
  const boxX = Math.min(Math.max(markerX - boxWidth / 2, pad.left + 4), 900 - pad.right - boxWidth - 4);
  const boxY = pad.top + 8;

  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", boxX);
  rect.setAttribute("y", boxY);
  rect.setAttribute("width", boxWidth);
  rect.setAttribute("height", boxHeight);
  rect.setAttribute("rx", 6);
  rect.setAttribute("class", "depletion-label-bg");
  svg.append(rect);

  const labelText = text(boxX + boxWidth / 2, boxY + 19, label, "depletion-label");
  labelText.setAttribute("text-anchor", "middle");
  svg.append(labelText);
}

function update() {
  const v = readValues();
  const validation = validate(v);
  output.validationMessage.textContent = validation;

  if (validation) {
    output.equivalentRate.textContent = "-";
    output.depletionAge.textContent = "-";
    output.matchedDepositPayout.textContent = "-";
    output.totalPaid.textContent = "-";
    output.insuranceTotalReceived.textContent = "-";
    output.depositTotalReceived.textContent = "-";
    output.insuranceReserve.textContent = "-";
    output.depositStartBalance.textContent = "-";
    output.reserveGap.textContent = "-";
    renderChart({ rows: [] }, { rows: [] }, { payStartAge: 0, payYears: 1, receiveStartAge: 1, receiveEndAge: 2 });
    return;
  }

  const equivalent = solveEquivalentRate(v);
  output.equivalentRate.textContent = equivalent.rate === null ? "계산 불가" : `${equivalent.rate.toFixed(2)}%`;

  const samePayout = buildBalanceSeries(v, v.depositRate, v.insurancePayout);
  if (samePayout.depletionMonth === null) {
    output.depletionAge.textContent = "잔액 남음";
    output.depletionDetail.textContent = `${formatAge(v.receiveEndAge)} 기준 ${krw.format(samePayout.finalBalance)} 남음`;
  } else {
    output.depletionAge.textContent = formatAge(ageFromMonth(v, samePayout.depletionMonth));
    output.depletionDetail.textContent = `${krw.format(v.insurancePayout)}씩 수령 시 소진`;
  }

  const matchedPayout = solveMonthlyWithdrawal(v, v.depositRate);
  output.matchedDepositPayout.textContent = krw.format(matchedPayout);
  output.matchedDetail.textContent = `${formatAge(v.receiveEndAge)}에 예금 잔액 0원 기준`;

  const matchedSeries = buildBalanceSeries(v, v.depositRate, matchedPayout);
  const insuranceSeries =
    equivalent.rate === null
      ? { rows: [], receiveStartBalance: 0 }
      : buildBalanceSeries(v, equivalent.rate, v.insurancePayout);
  const depositStartBalance = balanceBeforeReceiving(v, v.depositRate);
  const receiveMonths = monthsBetween(v.receiveStartAge, v.receiveEndAge);
  const payMonths = Math.round(v.payYears * 12);
  const totalPaid = v.monthlyPremium * payMonths;
  const insuranceTotal = v.insurancePayout * receiveMonths;
  const reserveGap = depositStartBalance - insuranceSeries.receiveStartBalance;
  output.totalPaid.textContent = krw.format(totalPaid);
  output.totalPaidDetail.textContent = `${payMonths}개월 동안 ${krw.format(v.monthlyPremium)}씩 납입`;
  output.insuranceTotalReceived.textContent = krw.format(insuranceTotal);
  output.insuranceTotalDetail.textContent = `${receiveMonths}개월 동안 ${krw.format(v.insurancePayout)}씩 수령`;
  output.depositTotalReceived.textContent = krw.format(matchedSeries.received);
  output.depositTotalDetail.textContent = `같은 종료 나이 기준. 같은 월 수령액 기준은 ${krw.format(samePayout.received)}`;
  output.insuranceReserve.textContent = krw.format(insuranceSeries.receiveStartBalance);
  output.insuranceReserveDetail.textContent =
    equivalent.rate === null ? "환산 금리를 계산할 수 없습니다." : `환산 금리 ${equivalent.rate.toFixed(2)}%, 세율 ${v.taxRate}% 적용`;
  output.depositStartBalance.textContent = krw.format(depositStartBalance);
  output.depositStartBalanceDetail.textContent = `예금 연 ${v.depositRate}%, 세율 ${v.taxRate}% 적용`;
  output.reserveGap.textContent = krw.format(Math.abs(reserveGap));
  output.reserveGapDetail.textContent = reserveGap >= 0 ? "예금 잔액이 더 큽니다." : "예금 잔액이 부족합니다.";
  renderChart(samePayout, insuranceSeries, v);
}

document.getElementById("resetButton").addEventListener("click", () => {
  ids.forEach((id) => {
    inputs[id].value = defaults[id];
  });
  update();
});

ids.forEach((id) => inputs[id].addEventListener("input", update));
update();
