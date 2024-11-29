export function sortByDate(shifts, order = "asc") {
  const sortedShifts = [...shifts].sort((a, b) => {
    if (order === "asc") {
      return a.startTime - b.startTime;
    }

    return b.startTime - a.startTime;
  });

  return sortedShifts;
}

export function groupByUsers(shifts) {
  const shiftsByUser = shifts.reduce((acc, shift) => {
    if (!acc[shift.userId]) {
      acc[shift.userId] = [];
    }

    acc[shift.userId].push(shift);

    return acc;
  }, {});

  return shiftsByUser;
}

export function groupByDay(shifts) {
  const shiftsByDay = shifts.reduce((acc, shift) => {
    const day = shift.startTime.toDateString();

    if (!acc[day]) {
      acc[day] = [];
    }

    acc[day].push(shift);

    return acc;
  }, {});

  return shiftsByDay;
}
