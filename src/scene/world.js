// Shared conveyor-belt constants used by every system that pools/recycles
// geometry along the river (water, banks, obstacles) so they all cover the
// same visible span and hand off recycling at the same point.
export const SEGMENT_LENGTH = 24;
export const SEGMENTS_PER_SIDE = 8;
export const SPAWN_Z = -(SEGMENTS_PER_SIDE * SEGMENT_LENGTH) + 20;
export const RECYCLE_Z = 14;
