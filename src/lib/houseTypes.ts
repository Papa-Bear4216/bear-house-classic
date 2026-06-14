export type Floor = { id: string; label: string };

export type AnchorType = "window" | "appliance" | "door" | "fixture" | "other";
export type Anchor = { id: string; type: AnchorType; label?: string; embedding: string };

export type ZoneType =
  | "countertop" | "sink" | "stovetop" | "floor" | "bed" | "desk"
  | "dresser" | "trash" | "table" | "shelf" | "mirror" | "other";

export type VerifyMethod =
  | "tap" | "photo" | "sink_empty" | "counter_clear" | "floor_clear" | "trash_empty";

export type Step = { id: string; text: string; verify: VerifyMethod };

export type Frequency = "daily" | "weekly" | "monthly" | "asNeeded";

export type Chore = {
  id: string;
  name: string;
  emoji?: string;
  points: number;
  frequency: Frequency;
  ageMin?: number;
  triggerWhen?: Record<string, unknown>;
  steps: Step[];
};

export type Zone = {
  id: string;
  type: ZoneType;
  label: string;
  cleanBaseline?: Record<string, unknown>;
  chores: Chore[];
};

export type Room = {
  id: string;
  floorId: string;
  name: string;
  icon?: string;
  owner?: string | null;
  baselineImage?: string;
  anchors?: Anchor[];
  zones: Zone[];
};

export type House = {
  houseId: string;
  name: string;
  version: number;
  capturedAt?: string;
  capturedBy?: string;
  floors: Floor[];
  rooms: Room[];
};
