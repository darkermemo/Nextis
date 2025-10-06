interface MoodPillProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MoodPill({ isOpen, onClose }: MoodPillProps) {
  if (!isOpen) return null;

  const moods = [
    { emoji: '😊', label: 'Happy' },
    { emoji: '😌', label: 'Calm' },
    { emoji: '😴', label: 'Tired' },
    { emoji: '😤', label: 'Stressed' },
    { emoji: '🤔', label: 'Focused' },
  ];

  const handleMoodSelect = (mood: string) => {
    // Track mood selection
    console.log('Mood selected:', mood);
    onClose();
  };

  return (
    <div className="px-4 py-2 border-b glass-card animate-in slide-in-from-top duration-200">
      <div className="flex items-center gap-2 max-w-screen-lg mx-auto">
        <span className="text-[12px] text-muted-foreground mr-1">Feeling?</span>
        {moods.map((mood) => (
          <button
            key={mood.label}
            onClick={() => handleMoodSelect(mood.label)}
            className="p-2 hover:bg-accent rounded-xl transition-all active:scale-95"
            aria-label={mood.label}
            title={mood.label}
          >
            <span className="text-lg">{mood.emoji}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
