import type { House } from './houseTypes';

export const sampleHouse: House = {
  houseId: 'den-7f3a',
  name: 'The Hebert Den',
  version: 1,
  capturedAt: '2026-06-14T08:52:00Z',
  capturedBy: 'user_michael',
  floors: [
    { id: 'main', label: 'Main Floor' },
    { id: 'up', label: 'Upstairs' },
  ],
  rooms: [
    {
      id: 'room_kitchen',
      floorId: 'main',
      name: 'Kitchen',
      icon: '🍽️',
      owner: null,
      baselineImage: 'blob://kitchen_clean_2026-06-14.jpg',
      anchors: [
        { id: 'anc_window', type: 'window', embedding: 'v_8f1c' },
        { id: 'anc_fridge', type: 'appliance', label: 'refrigerator', embedding: 'v_2a90' },
      ],
      zones: [
        {
          id: 'zone_counter',
          type: 'countertop',
          label: 'Main Counter',
          cleanBaseline: { clutterScore: 0.05 },
          chores: [
            {
              id: 'chore_wipe_counter',
              name: 'Wipe counters',
              emoji: '🧽',
              points: 40,
              frequency: 'daily',
              ageMin: 8,
              steps: [
                { id: 's1', text: 'Clear items off the counter', verify: 'counter_clear' },
                { id: 's2', text: 'Spray and wipe the surface', verify: 'photo' },
                { id: 's3', text: 'Put the spray back under the sink', verify: 'tap' },
              ],
            },
          ],
        },
        {
          id: 'zone_sink',
          type: 'sink',
          label: 'Kitchen Sink',
          cleanBaseline: { dishCount: 0 },
          chores: [
            {
              id: 'chore_load_dishwasher',
              name: 'Load dishwasher',
              emoji: '🍽️',
              points: 60,
              frequency: 'daily',
              ageMin: 10,
              steps: [
                { id: 's1', text: 'Scrape food into the trash', verify: 'tap' },
                { id: 's2', text: 'Load all dishes into the dishwasher', verify: 'sink_empty' },
                { id: 's3', text: 'Add detergent and start it', verify: 'photo' },
              ],
            },
          ],
        },
        {
          id: 'zone_trash',
          type: 'trash',
          label: 'Trash Corner',
          cleanBaseline: { fillLevel: 0.0 },
          chores: [
            {
              id: 'chore_take_trash',
              name: 'Take out trash',
              emoji: '🗑️',
              points: 75,
              frequency: 'daily',
              ageMin: 6,
              triggerWhen: { fillLevel: '>=0.8' },
              steps: [
                { id: 's1', text: 'Tie up the full bag', verify: 'tap' },
                { id: 's2', text: 'Carry it to the outside bin', verify: 'tap' },
                { id: 's3', text: 'Put a fresh bag in the can', verify: 'trash_empty' },
              ],
            },
          ],
        },
      ],
    },
  ],
};
