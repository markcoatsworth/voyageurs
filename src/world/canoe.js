import { createCanoeSprite, createCapsizedCanoeSprite } from './sprites.js';

// left/right are the two stroke frames — paddle out to one side or the
// other, swapped on a timer in game.js. `capsized` is the overturned hull,
// used only by world/capsize.js once the canoe has gone over; it lives in
// the same set so the capsize animation can be handed one object and pick
// whichever it needs mid-roll.
export function createCanoeSprites() {
  return {
    left: createCanoeSprite(-1),
    right: createCanoeSprite(1),
    capsized: createCapsizedCanoeSprite(),
  };
}
