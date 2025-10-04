import { useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { CalendarResponse } from "../types";
import dayjs from "dayjs";
import weekOfYear from "dayjs/plugin/weekOfYear";

dayjs.extend(weekOfYear);

export function CalendarView() {
  const [currentWeek, setCurrentWeek] = useState(dayjs().startOf('week'));

  const { data: calendarData, isLoading } = useQuery<CalendarResponse>({
    queryKey: ["/api/calendar", currentWeek.toISOString()],
    queryFn: () => api.getCalendar(currentWeek.toISOString()),
  });

  const getTypeColor = (type: string) => {
    switch (type) {
      case "task": 
        return "bg-purple-100 text-purple-800 border-l-2 border-purple-500";
      case "event": 
        return "bg-blue-100 text-blue-800 border-l-2 border-blue-500";
      case "breakTime": 
        return "bg-amber-100 text-amber-800 border-l-2 border-amber-500";
      case "leisure": 
        return "bg-pink-100 text-pink-800 border-l-2 border-pink-500";
      case "quiz": 
        return "bg-green-100 text-green-800 border-l-2 border-green-500";
      default: 
        return "bg-gray-100 text-gray-800 border-l-2 border-gray-500";
    }
  };

  const getItemPosition = (startTime: string, endTime: string) => {
    const start = dayjs(startTime);
    const end = dayjs(endTime);
    const startMinutes = start.hour() * 60 + start.minute();
    const duration = end.diff(start, 'minutes');
    
    // Calculate position within the hour slot (each slot is 60px height)
    const baseHour = Math.floor(startMinutes / 60);
    const offsetMinutes = startMinutes % 60;
    const top = (offsetMinutes / 60) * 60; // Convert to pixels
    const height = Math.min((duration / 60) * 60, 120); // Max 2 hours height
    
    return { top, height };
  };

  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 8; hour < 24; hour++) {
      slots.push(hour);
    }
    return slots;
  };

  const generateWeekDays = () => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      days.push(currentWeek.add(i, 'day'));
    }
    return days;
  };

  const getEventsForDay = (day: dayjs.Dayjs) => {
    if (!calendarData?.items) return [];
    
    return calendarData.items.filter(item => {
      if (!item.start) return false;
      return dayjs(item.start).isSame(day, 'day');
    });
  };

  const previousWeek = () => {
    setCurrentWeek(prev => prev.subtract(1, 'week'));
  };

  const nextWeek = () => {
    setCurrentWeek(prev => prev.add(1, 'week'));
  };

  const goToToday = () => {
    setCurrentWeek(dayjs().startOf('week'));
  };

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-4 sm:p-6">
          <div className="text-center py-8">
            <div className="text-muted-foreground">Loading calendar...</div>
          </div>
        </div>
      </div>
    );
  }

  const weekDays = generateWeekDays();
  const timeSlots = generateTimeSlots();

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-6">
        {/* Calendar Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              {currentWeek.format('MMMM YYYY')}
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Week of {currentWeek.format('MMM D')} - {currentWeek.endOf('week').format('MMM D')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={previousWeek}
              className="p-2 hover:bg-muted rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              data-testid="previous-week"
            >
              <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button 
              onClick={goToToday}
              className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors min-h-[44px] sm:px-4"
              data-testid="go-to-today"
            >
              Today
            </button>
            <button 
              onClick={nextWeek}
              className="p-2 hover:bg-muted rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              data-testid="next-week"
            >
              <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="bg-card border border-border rounded-lg overflow-x-auto overflow-y-hidden">
          <div className="calendar-grid">
            {/* Header Row */}
            <div className="bg-muted p-3 text-xs font-semibold text-muted-foreground"></div>
            {weekDays.map((day) => (
              <div key={day.toISOString()} className="bg-muted p-3 text-center">
                <div className="text-xs font-semibold text-muted-foreground">
                  {day.format('ddd')}
                </div>
                <div className={`text-lg font-bold mt-1 ${
                  day.isSame(dayjs(), 'day') ? 'text-primary' : 'text-foreground'
                }`}>
                  {day.format('D')}
                </div>
              </div>
            ))}

            {/* Time Slots */}
            {timeSlots.map((hour) => (
              <Fragment key={hour}>
                <div className="calendar-time-slot p-2 text-xs text-muted-foreground font-mono">
                  {hour.toString().padStart(2, '0')}:00
                </div>
                
                {weekDays.map((day) => {
                  const dayEvents = getEventsForDay(day).filter(item => {
                    if (!item.start) return false;
                    const itemHour = dayjs(item.start).hour();
                    return itemHour === hour;
                  });

                  return (
                    <div key={`${day.toISOString()}-${hour}`} className="calendar-time-slot">
                      {dayEvents.map((item) => {
                        if (!item.start || !item.end) return null;
                        
                        const position = getItemPosition(item.start, item.end);
                        
                        return (
                          <div
                            key={item.id}
                            className={`calendar-event ${getTypeColor(item.type)}`}
                            style={{ 
                              top: `${position.top}px`, 
                              height: `${position.height}px` 
                            }}
                            data-testid={`calendar-event-${item.id}`}
                          >
                            <div className="font-semibold truncate">{item.title}</div>
                            <div className="text-xs opacity-75">
                              {dayjs(item.start).format('HH:mm')} - {dayjs(item.end).format('HH:mm')}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-6 flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-purple-500"></div>
            <span className="text-xs text-muted-foreground">Study Blocks</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-blue-500"></div>
            <span className="text-xs text-muted-foreground">Events/Meetings</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-amber-500"></div>
            <span className="text-xs text-muted-foreground">Breaks</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-pink-500"></div>
            <span className="text-xs text-muted-foreground">Leisure</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-green-500"></div>
            <span className="text-xs text-muted-foreground">Quizzes</span>
          </div>
        </div>
      </div>
    </div>
  );
}
