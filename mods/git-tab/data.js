import locationMethods from "./data/location.js";
import refreshMethods from "./data/refresh.js";
import lazyMethods from "./data/lazy.js";

export const dataMethods = Object.assign({}, locationMethods, refreshMethods, lazyMethods);

export default dataMethods;
