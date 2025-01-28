import AirDatepicker from "air-datepicker";

export const todayButton = {
    content: "Today",
    onClick: (dp: AirDatepicker) => {
      const date = new Date();
      dp.selectDate(date);
      dp.setViewDate(date);
    },
  };