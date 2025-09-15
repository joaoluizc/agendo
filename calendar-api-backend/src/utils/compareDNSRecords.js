function areTargetRecordsEqual(record1, record2) {
  if (String(record1) === String(record2)) {
    return true;
  }
  return false;
}

function matchARecords(aRecords) {
  if (aRecords.length === 0) {
    return "NOT OK. No A records found.";
  }
  if (aRecords.includes("100.24.208.97") && aRecords.includes("35.172.94.1")) {
    if (aRecords.length === 2) {
      return "OK. Duda main instance A records found.";
    } else {
      return "NOT OK. Duda main instance A records found, but there are extra records. Remove the extra records.";
    }
  }
  if (aRecords.includes("52.59.120.70") && aRecords.includes("18.197.248.23")) {
    if (aRecords.length === 2) {
      return "OK. Duda EU instance A records found.";
    } else {
      return "NOT OK. Duda EU instance A records found, but there are extra records. Remove the extra records.";
    }
  }
  return "NOT OK. Please check the A records.";
}

function matchCnameRecords(cnameRecords) {
  if (areTargetRecordsEqual(cnameRecords, ["s.multiscreensite.com"])) {
    return "OK. Duda main instance CNAME record found.";
  } else if (
    areTargetRecordsEqual(cnameRecords, ["s.eu-multiscreensite.com"])
  ) {
    return "OK. Duda EU instance CNAME record found.";
  } else {
    return "NOT OK. Please check the CNAME record.";
  }
}

export function compareDNSRecordsToDuda(naked, www) {
  const aRecordsDiagnosis = matchARecords(naked.A);
  const cnameRecordsDiagnosis = matchCnameRecords(www.CNAME);

  let aaaaRecordsDiagnosis;
  if (areTargetRecordsEqual(naked.AAAA, [])) {
    aaaaRecordsDiagnosis = "OK. No AAAA records found.";
  } else {
    aaaaRecordsDiagnosis =
      "NOT OK. AAAA record found. Please delete all AAA records.";
  }

  let caaRecordsDiagnosis;
  if (areTargetRecordsEqual(naked.CAA, [])) {
    caaRecordsDiagnosis = "OK. No CAA records found.";
  } else {
    caaRecordsDiagnosis =
      "NOT OK. CAA record found. Please delete all CAA records.";
  }

  return {
    aRecordsDiagnosis,
    aaaaRecordsDiagnosis,
    cnameRecordsDiagnosis,
    caaRecordsDiagnosis,
  };
}
