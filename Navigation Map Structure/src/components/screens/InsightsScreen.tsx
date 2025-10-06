import { Sparkles, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';

export function InsightsScreen() {
  const currentWeekStats = {
    done: 42,
    skipped: 3,
    snoozes: 8,
    avgDelay: '12m',
    avgSleep: '7.5h',
    activeHours: '8.2h',
    completionRate: 87,
  };

  const insights = `This week you showed strong consistency with morning deep work sessions. Your completion rate improved by 12% compared to last week. Consider scheduling more breaks in the afternoon when your snooze rate tends to increase.`;

  const recentWeeks = [
    { week: 'Oct 29 - Nov 4', done: 38, completion: 82, color: 'bg-green-500' },
    { week: 'Oct 22 - Oct 28', done: 35, completion: 75, color: 'bg-yellow-500' },
    { week: 'Oct 15 - Oct 21', done: 40, completion: 85, color: 'bg-green-500' },
    { week: 'Oct 8 - Oct 14', done: 32, completion: 70, color: 'bg-orange-500' },
  ];

  return (
    <div className="flex-1 overflow-y-auto pb-20">
      {/* Header */}
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px]">Weekly Reflection</h2>
          <Button size="sm">
            <Sparkles size={14} className="mr-1" />
            Generate
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Current Week Summary */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px]">This Week</h3>
            <span className="text-[11px] text-muted-foreground">Oct 6 - Oct 12</span>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center p-3 bg-accent rounded-lg">
              <div className="text-[17px]">{currentWeekStats.done}</div>
              <div className="text-[11px] text-muted-foreground">Done</div>
            </div>
            <div className="text-center p-3 bg-accent rounded-lg">
              <div className="text-[17px]">{currentWeekStats.skipped}</div>
              <div className="text-[11px] text-muted-foreground">Skipped</div>
            </div>
            <div className="text-center p-3 bg-accent rounded-lg">
              <div className="text-[17px]">{currentWeekStats.snoozes}</div>
              <div className="text-[11px] text-muted-foreground">Snoozes</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center p-3 bg-accent rounded-lg">
              <div className="text-[17px]">{currentWeekStats.avgDelay}</div>
              <div className="text-[11px] text-muted-foreground">Avg Delay</div>
            </div>
            <div className="text-center p-3 bg-accent rounded-lg">
              <div className="text-[17px]">{currentWeekStats.avgSleep}</div>
              <div className="text-[11px] text-muted-foreground">Sleep</div>
            </div>
            <div className="text-center p-3 bg-accent rounded-lg">
              <div className="text-[17px]">{currentWeekStats.activeHours}</div>
              <div className="text-[11px] text-muted-foreground">Active</div>
            </div>
          </div>

          {/* Completion Rate */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px]">Completion Rate</span>
              <span className="text-[13px]">{currentWeekStats.completionRate}%</span>
            </div>
            <Progress value={currentWeekStats.completionRate} className="h-2" />
          </div>

          {/* AI Insights */}
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
            <div className="flex items-start gap-2 mb-2">
              <Sparkles size={16} className="text-primary mt-0.5 shrink-0" />
              <h4 className="text-[13px]">AI Insights</h4>
            </div>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              {insights}
            </p>
          </div>
        </div>

        {/* Recent Weeks */}
        <div className="space-y-2">
          <h3 className="text-[15px] px-1">Recent Weeks</h3>
          {recentWeeks.map((week) => (
            <button
              key={week.week}
              className="w-full bg-card border border-border rounded-lg p-4 hover:bg-accent/50 transition-colors text-left"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[13px]">{week.week}</span>
                <ChevronRight size={16} className="text-muted-foreground" />
              </div>
              
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-muted-foreground">Completed</span>
                    <span className="text-[11px]">{week.done} tasks</span>
                  </div>
                  <Progress value={week.completion} className="h-1.5" />
                </div>
                
                <div className={`w-12 h-12 rounded-full ${week.color} flex items-center justify-center`}>
                  <span className="text-white text-[13px]">{week.completion}%</span>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Historical Trends */}
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-[15px] mb-3">All-Time Stats</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center p-3 bg-accent rounded-lg">
              <div className="text-[17px]">187</div>
              <div className="text-[11px] text-muted-foreground">Total Tasks</div>
            </div>
            <div className="text-center p-3 bg-accent rounded-lg">
              <div className="text-[17px]">83%</div>
              <div className="text-[11px] text-muted-foreground">Avg Rate</div>
            </div>
            <div className="text-center p-3 bg-accent rounded-lg">
              <div className="text-[17px]">28</div>
              <div className="text-[11px] text-muted-foreground">Days</div>
            </div>
            <div className="text-center p-3 bg-accent rounded-lg">
              <div className="text-[17px]">6.7</div>
              <div className="text-[11px] text-muted-foreground">Tasks/Day</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
