const CalendarHeader = () => {
    const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);

    return (
        <div className="flex">
            <div className="p-2" style={{ width: '12%' }}></div>
            <div className="flex-1 overflow-x-auto">
                <div className="grid" style={{ gridTemplateColumns: 'repeat(48, minmax(0, 1fr))' }}>
                    {Array.from({ length: 48 }, (_, i) => (
                        <div
                            key={i}
                            className={`col-span-2 border-r text-center text-xs font-bold truncate font-semibold ${i % 2 === 0 ? '' : 'hidden'}`}
                            style={{ gridColumn: `span 2` }}
                        >
                            {i % 2 === 0 && hours[i / 2]}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
};

export default CalendarHeader;