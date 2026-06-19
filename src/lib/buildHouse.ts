import type { House, Room } from './houseTypes';

export function buildEmptyHouse(houseId: string, name: string): House {
  return {
    houseId,
    name,
    version: 1,
    floors: [],
    rooms: [],
  };
}

export function addRoom(house: House, room: Room): House {
  return { ...house, rooms: [...house.rooms, room] };
}

const buildHouse = { buildEmptyHouse, addRoom };
export default buildHouse;
