export class F5Engine {
  constructor({daemonPath}){ this.daemonPath=daemonPath }
  async ping(){ return true }
}
