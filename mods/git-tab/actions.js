import navMethods from "./actions/nav.js";
import selectMethods from "./actions/select.js";
import githubMethods from "./actions/github.js";

export const actionMethods = Object.assign({}, navMethods, selectMethods, githubMethods);

export default actionMethods;
