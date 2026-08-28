import { createCanoeSprite } from './sprites.js';

// Two frames — paddle out to the left or right — swapped on a timer in
// game.js to animate the stroke.
export function createCanoeSprites() {
  return {
    left: createCanoeSprite(-1),
    right: createCanoeSprite(1),
  };
}
