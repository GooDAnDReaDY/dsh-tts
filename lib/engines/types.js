export class EngineRegistry {
  constructor({gpu, installed}) { this.gpu=gpu; this.installed=installed }
  list(){ return this.installed.map(id=>({id, supports:()=>true})) }
}
