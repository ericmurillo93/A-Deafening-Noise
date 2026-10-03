import assert from "node:assert/strict";
import { festivalEditions } from "../src/lib/festivals.js";
import { readRouteFromLocation, routeToPath } from "../src/lib/routes.js";
const concerts = [
  {artist:"BAND B",venue:"HELLFEST",date:"22/06/2024",bought:true},
  {artist:"BAND A",venue:"HELLFEST",date:"21/06/2024",bought:true},
  {artist:"BAND C",venue:"OTHER VENUE",festival:"Hellfest",date:"21/06/2025",bought:true},
  {artist:"NOT A FESTIVAL",venue:"ORDINARY VENUE",date:"01/01/2024",bought:true},
];
const editions = festivalEditions(concerts);
assert.equal(editions.length,2);
assert.equal(editions[0].year,"2025");
assert.deepEqual(editions[1].concerts.map((concert) => concert.artist),["BAND A","BAND B"]);
assert.equal(editions[1].seen,2);
assert.equal(concerts[0].artist,"BAND B");
const path = routeToPath({page:"festivals",festival:editions[1].key});
global.window={location:{pathname:path,hash:""}};
assert.equal(readRouteFromLocation().festival,editions[1].key);
