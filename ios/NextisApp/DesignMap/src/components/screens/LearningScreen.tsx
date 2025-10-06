import { Brain, TrendingUp, Clock, CheckCircle, Droplet, Dumbbell, Mail, RefreshCw } from 'lucide-react';
import { StatCard } from '../StatCard';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Slider } from '../ui/slider';
import { Progress } from '../ui/progress';

export function LearningScreen() {
  const weekdaySuccess = [
    { day: 'Mon', progress: 85 },
    { day: 'Tue', progress: 92 },
    { day: 'Wed', progress: 78 },
    { day: 'Thu', progress: 88 },
    { day: 'Fri', progress: 95 },
    { day: 'Sat', progress: 70 },
    { day: 'Sun', progress: 65 },
  ];

  const bestTimeWindows = [
    { time: '9:00-11:00 AM', score: 95 },
    { time: '2:00-4:00 PM', score: 88 },
    { time: '7:00-9:00 PM', score: 72 },
  ];

  const learnedLengths = [
    { duration: '15m', count: 42 },
    { duration: '30m', count: 38 },
    { duration: '45m', count: 24 },
    { duration: '1h', count: 31 },
    { duration: '2h', count: 18 },
  ];

  return (
    <div className="flex-1 overflow-y-auto pb-20">
      {/* Hero */}
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Brain size={24} className="text-primary" />
            <h2 className="text-[17px]">Learning Dashboard</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <RefreshCw size={14} className="mr-1" />
              Update
            </Button>
            <Button variant="ghost" size="sm">
              Reset
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Stats Overview */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={CheckCircle} value="142" label="Events Tracked" variant="success" />
          <StatCard icon={TrendingUp} value="28" label="Days Active" variant="primary" />
        </div>

        {/* Weekday Success */}
        <div className="bg-card border border-border rounded-lg p-3">
          <h3 className="text-[13px] mb-3">Weekday Success</h3>
          <div className="space-y-2">
            {weekdaySuccess.map((day) => (
              <div key={day.day} className="flex items-center gap-3">
                <span className="text-[11px] w-10 text-muted-foreground">{day.day}</span>
                <div className="flex-1">
                  <Progress value={day.progress} className="h-2" />
                </div>
                <span className="text-[11px] w-8 text-right">{day.progress}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Best Time Windows */}
        <div className="bg-card border border-border rounded-lg p-3">
          <h3 className="text-[13px] mb-3">Best Time Windows</h3>
          <div className="space-y-2">
            {bestTimeWindows.map((window, index) => (
              <div key={window.time} className="flex items-center gap-3">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-[10px]">
                  {index + 1}
                </div>
                <span className="flex-1 text-[13px]">{window.time}</span>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-accent rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${window.score}%` }}
                    />
                  </div>
                  <span className="text-[11px] w-8 text-right text-muted-foreground">{window.score}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Learned Lengths */}
        <div className="bg-card border border-border rounded-lg p-3">
          <h3 className="text-[13px] mb-3">Learned Lengths</h3>
          <div className="grid grid-cols-5 gap-2">
            {learnedLengths.map((item) => (
              <div key={item.duration} className="text-center">
                <div className="bg-accent rounded-lg p-2 mb-1">
                  <Clock size={16} className="mx-auto text-primary mb-1" />
                  <div className="text-[11px]">{item.duration}</div>
                </div>
                <div className="text-[10px] text-muted-foreground">{item.count}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Trends */}
        <div className="bg-card border border-border rounded-lg p-3">
          <h3 className="text-[13px] mb-3">Recent Trends</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center p-2 bg-green-500/10 rounded">
              <div className="text-[15px] text-green-600 dark:text-green-400">87%</div>
              <div className="text-[10px] text-muted-foreground">Completed</div>
            </div>
            <div className="text-center p-2 bg-orange-500/10 rounded">
              <div className="text-[15px] text-orange-600 dark:text-orange-400">8</div>
              <div className="text-[10px] text-muted-foreground">Snoozes</div>
            </div>
          </div>
        </div>

        {/* Preferences */}
        <div className="bg-card border border-border rounded-lg p-3">
          <h3 className="text-[13px] mb-3">Planner Preferences</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[13px]">Evening preference</label>
              <Switch />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-[13px]">Auto breaks</label>
              <Switch defaultChecked />
            </div>
            <div className="space-y-2">
              <label className="text-[13px]">Max focus (minutes)</label>
              <Slider defaultValue={[90]} min={30} max={120} step={15} />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>30</span>
                <span>120</span>
              </div>
            </div>
          </div>
        </div>

        {/* Health Tracker */}
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Droplet size={16} className="text-blue-500" />
              <h3 className="text-[13px]">Water Tracker</h3>
            </div>
            <Button size="sm" variant="outline">+ Add</Button>
          </div>
          <div className="flex items-center gap-2">
            <Progress value={62.5} className="flex-1" />
            <span className="text-[11px] text-muted-foreground">5/8</span>
          </div>
        </div>

        {/* Gym Planner */}
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Dumbbell size={16} className="text-orange-500" />
              <h3 className="text-[13px]">Gym Planner</h3>
            </div>
            <div className="text-[11px] text-muted-foreground">🔥 7 day streak</div>
          </div>
          <Button className="w-full" size="sm">View Plan</Button>
        </div>

        {/* Gmail Integration */}
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Mail size={16} className="text-red-500" />
              <h3 className="text-[13px]">Gmail</h3>
            </div>
            <div className="text-[11px] text-green-600 dark:text-green-400">Connected</div>
          </div>
          <Button variant="outline" className="w-full" size="sm">Sync Now</Button>
        </div>
      </div>
    </div>
  );
}
