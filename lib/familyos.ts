export type Role = 'superadmin' | 'admin' | 'child';

export type AppUser = {
  id: string;
  name: string;
  color: string; // Tailwind bg color class
  role: Role;
  avatarUrl?: string;
  points: number;
  meetLink?: string;
  isExempt?: boolean;
  familyCode?: string;
  createdAt?: any;
  updatedAt?: any;
};

export const USERS: AppUser[] = [
  { id: '1', name: 'Daddy (Mike)', color: 'bg-blue-500', role: 'superadmin', points: 0, meetLink: 'https://meet.google.com/new', familyCode: 'BEAR12' },
  { id: '2', name: 'Mommy (Gwen)', color: 'bg-pink-500', role: 'admin', points: 0, meetLink: 'https://meet.google.com/new', isExempt: true, familyCode: 'BEAR12' },
  { id: '3', name: 'Julia', color: 'bg-green-500', role: 'child', points: 150, meetLink: 'https://meet.google.com/new', familyCode: 'BEAR12' },
  { id: '4', name: 'Abriana', color: 'bg-yellow-500', role: 'child', points: 120, meetLink: 'https://meet.google.com/new', familyCode: 'BEAR12' },
];

export type Task = {
  id: string;
  title: string;
  assigneeId: string;
  date: string; // YYYY-MM-DD
  completed: boolean; // Keep for backwards compatibility
  status?: 'todo' | 'pending' | 'done';
  pointsValue: number;
  properStorage?: string;
  mapX?: number;
  mapY?: number;
  roomId?: string;
  createdAt?: any;
  updatedAt?: any;
};

export const STORAGE_KEYS = {
  TASKS: 'bearhouse_tasks',
  POINTS: 'bearhouse_points',
  EVENTS: 'bearhouse_events',
};

export type CalendarEvent = {
  id: string;
  title: string;
  userId: string;
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:MM
  endTime?: string; // HH:MM
};

// Initial mock events
export const INITIAL_EVENTS: CalendarEvent[] = [
  { id: 'e1', title: 'Daddy Work', userId: '1', date: new Date().toISOString().split('T')[0], startTime: '09:00', endTime: '17:00' },
  { id: 'e2', title: 'Mommy Class', userId: '2', date: new Date().toISOString().split('T')[0], startTime: '14:00', endTime: '16:00' },
];

// Initial mock data if empty
export const INITIAL_TASKS: Task[] = [
  { id: 't1', title: 'Take out trash', assigneeId: '1', date: new Date().toISOString().split('T')[0], completed: false, status: 'todo', pointsValue: 10 },
  { id: 't2', title: 'Feed the mathereals', assigneeId: '2', date: new Date().toISOString().split('T')[0], completed: true, status: 'done', pointsValue: 10 },
  { id: 't3', title: 'Clean room', assigneeId: '3', date: new Date().toISOString().split('T')[0], completed: false, status: 'todo', pointsValue: 20 },
  { id: 't4', title: 'Do homework', assigneeId: '4', date: new Date().toISOString().split('T')[0], completed: false, status: 'todo', pointsValue: 30 },
];

export type MissionChore = {
  choreId: number;
  choreTitle: string;
  location: string;
  itemsInvolved: string[];
  properStorage: string;
  priority: string;
  estimatedTime: string;
  difficulty: string;
};

export type Mission = {
  missionId: number;
  missionName: string;
  description: string;
  relatedChores: MissionChore[];
  totalTimeEstimate: string;
  funFact: string;
};

export const HOUSE_MISSIONS: Mission[] = [
  {
    "missionId": 1,
    "missionName": "The Toy Rescue Expedition",
    "description": "Round up the scattered items and return them to their designated base camps in the Living Room.",
    "relatedChores": [
      {
        "choreId": 101,
        "choreTitle": "Lego & Figure Roundup",
        "location": "Living Room Floor",
        "itemsInvolved": ["Lego bricks", "Action figures"],
        "properStorage": "Living Room -> Primary Toy Bin",
        "priority": "high",
        "estimatedTime": "10 minutes",
        "difficulty": "medium"
      },
      {
        "choreId": 102,
        "choreTitle": "The Book Parade",
        "location": "Coffee Table",
        "itemsInvolved": ["3 Children's books"],
        "properStorage": "Living Room -> Bookshelf (Lower Tiers)",
        "priority": "medium",
        "estimatedTime": "3 minutes",
        "difficulty": "easy"
      }
    ],
    "totalTimeEstimate": "13 minutes",
    "funFact": "If you stacked every Lego brick ever made, the tower would reach the moon ten times!"
  },
  {
    "missionId": 2,
    "missionName": "Operation Couch Cozy",
    "description": "Re-establish the comfort zone by organizing the textiles.",
    "relatedChores": [
      {
        "choreId": 201,
        "choreTitle": "Pillow & Blanket Alignment",
        "location": "Living Room Rug",
        "itemsInvolved": ["4 Throw pillows", "1 Fleece blanket"],
        "properStorage": "Living Room -> Storage Ottoman (blanket) and Sofa (pillows)",
        "priority": "low",
        "estimatedTime": "5 minutes",
        "difficulty": "easy"
      }
    ],
    "totalTimeEstimate": "5 minutes",
    "funFact": "A tidy living room makes it 20% easier for your brain to relax after a long day!"
  },
  {
    "missionId": 3,
    "missionName": "The Island Clear-Off",
    "description": "Clean the kitchen surfaces to prepare for the next meal mission.",
    "relatedChores": [
      {
        "choreId": 301,
        "choreTitle": "Paper Patrol",
        "location": "Kitchen Island",
        "itemsInvolved": ["Mail", "Flyers", "Loose pens"],
        "properStorage": "Kitchen -> Island Drawer 2 (Utility)",
        "priority": "high",
        "estimatedTime": "4 minutes",
        "difficulty": "easy"
      },
      {
        "choreId": 302,
        "choreTitle": "Snack Debris Disposal",
        "location": "Kitchen Counter",
        "itemsInvolved": ["Empty juice box", "Crumb trail"],
        "properStorage": "Kitchen -> Under-Sink Cabinet (Trash/Recycling)",
        "priority": "high",
        "estimatedTime": "2 minutes",
        "difficulty": "easy"
      }
    ],
    "totalTimeEstimate": "6 minutes",
    "funFact": "Did you know recycling one glass bottle saves enough energy to power a computer for 25 minutes?"
  },
  {
    "missionId": 4,
    "missionName": "Wardrobe Wizardry",
    "description": "Magically transport wandering clothes back to their wardrobe homes.",
    "relatedChores": [
      {
        "choreId": 401,
        "choreTitle": "Sock Search and Rescue",
        "location": "Kid Bedroom Floor",
        "itemsInvolved": ["Dirty socks", "T-shirt"],
        "properStorage": "Kid Bedroom -> 3-Drawer Dresser (Top Drawer or Laundry Bin)",
        "priority": "high",
        "estimatedTime": "5 minutes",
        "difficulty": "easy"
      },
      {
        "choreId": 402,
        "choreTitle": "Shoe Pairing",
        "location": "Bedroom Doorway",
        "itemsInvolved": ["Sneakers", "Sandals"],
        "properStorage": "Kid Bedroom -> Closet Rack",
        "priority": "medium",
        "estimatedTime": "3 minutes",
        "difficulty": "easy"
      }
    ],
    "totalTimeEstimate": "8 minutes",
    "funFact": "The average person walks about 115,000 miles in a lifetime—that's 5 times around the Earth! Your shoes deserve a nice place to rest."
  }
];
