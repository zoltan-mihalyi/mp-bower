interface ConnectionAcceptor<I, O> {
    accept(out: Writable<Message<O>>): Writable<I>;
}
interface ConnectionListener {
    onConnect(user: User): void;
    onDisconnect?(user: User): void;
}
interface CommandListener {
    onCommand(command: string, params: any[], index: number, elapsed: number): void;
    onSync(index: number, elapsed: number): void;
}
interface ClientGame extends IdProvider, CommandListener {
    getInfo(): any;
    execute(command: string, ...params: any[]): void;
    executeSimulation(fn: Function): void;
    setState(state: ClientState): void;
    getState(): ClientState;
    getReplicator(): ReplicatorClient<any>;
    setReplicator(replicator: ReplicatorClient<any>): void;
    setPredicted(command: string, handler: Function): void;
    remote: boolean;
    startSync(): void;
    stopSync(): void;
    replaySimulation(index: number, elapsed: number): void;
}
interface GameListenerGeneric<T> {
    onJoin?(t: T): void;
    onLeave?(t: T): void;
    onReplication?(t: T, lastCommandIndex: number, elapsed: number, message: Message<any>): void;
    onCallback?(callback: Callback, params: any[]): void;
    onUserGameJoin?(userGame: UserGame): void;
    onUserGameLeave?(userGame: UserGame): void;
}
interface GameListener extends GameListenerGeneric<ClientGame> {
}
interface ServerGameListener extends GameListenerGeneric<UserGame> {
}
interface Callback extends IdProvider {
    clientGame: ClientGame;
}
interface Game extends ServerGameListener {
    addUser(user: User): UserGame;
    netUpdate(): void;
}
declare const enum ReplicationState {
    WAITING_FOR_SYNC = 0,
    BEFORE_FIRST_REPLICATION = 1,
    NORMAL = 2,
}
interface UserGame extends IdProvider {
    leave(): void;
    user: User;
    onLeave: Function;
    addCommand(name: string, callback: Function): void;
    setRelevanceSet(relevanceSet: RelevanceSet): void;
    getRelevanceSet(): RelevanceSet;
    getReplicator(): ReplicatorServer<any>;
    getRealState(): ServerState;
    getClientGame(): ClientGame;
    lastCommandIndex: number;
    getLastExecuted(): number;
    onCommand(command: string, params: any[], index: number, elapsed: number): void;
    onSync(index: number, elapsed: number): void;
    replicationState: ReplicationState;
    enableSync(): void;
}
interface IdMap<K extends IdProvider, V> {
    put(key: K, value: V): any;
    contains(key: K): boolean;
    get(key: K): V;
    remove(key: K): void;
}
interface IdProvider {
    id: number;
}
interface IdSet<T extends IdProvider> {
    put(element: T): void;
    get(element: IdProvider): T;
    getIndex(index: number): T;
    remove(item: T): void;
    removeIndex(index: number): void;
    forEach(callback: (value?: T, key?: string) => void): any;
    contains(item: any): boolean;
    containsIndex(index: number): boolean;
}
interface Main {
    Client: {
        new (listener: GameListener): ConnectionAcceptor<GameEvent, CommandEvent>;
    };
    BruteForceReplicatorClient: {
        new (): ReplicatorClient<BruteForceMessage>;
    };
    Server: {
        new (cl: ConnectionListener): Server;
    };
    Game: {
        new (info: any, gameListener: ServerGameListener, state?: ServerState): Game;
    };
    RelevanceSetVg: {
        new (state: ServerState): RelevanceSetVg;
    };
    WebsocketServer: {
        new (server: ConnectionAcceptor<string, string>, opts: any): any;
    };
    WebsocketClient: {
        new (acceptor: ConnectionAcceptor<string, string>, url: string): any;
    };
    JSONTransformer: {
        new (a: ConnectionAcceptor<any, any>): ConnectionAcceptor<string, string>;
    };
    DelayTransformer: {
        new <A, B>(target: ConnectionAcceptor<A, B>, n1: number, n2: number): ConnectionAcceptor<A, B>;
    };
}
interface AsyncConvert<F, T> {
    (f: F, callback: (t: T) => void): void;
}
interface GameEvent {
    eventType: string;
    gameId: number;
}
interface JoinEvent extends GameEvent {
    info: any;
}
interface SyncEvent extends GameEvent {
    index: number;
    elapsed: number;
}
interface CommandEvent extends SyncEvent {
    command: string;
    params: any[];
    callbacks: number[];
}
interface CallbackEvent extends GameEvent {
    callbackId: number;
    params: any[];
}
interface ReplicationEvent extends GameEvent {
    replicationData: any;
    lastCommandIndex: number;
    elapsed: number;
}
interface Message<T> {
    reliable: boolean;
    keepOrder: boolean;
    data: T;
}
interface Writable<T> {
    write(data: T): any;
    close(): any;
}
interface RelevanceSetFactory {
    new (state: ServerReplicationState): RelevanceSet;
}
interface RelevanceSetVg extends RelevanceSet {
    contains(e: any): boolean;
    createVisibilityGroup<T>(): VisibilityGroup<T>;
}
interface RelevanceSet extends ServerReplicationState {
    remove(e: any): void;
}
interface VisibilityGroup<T> {
    add(entity: T): void;
    remove(entity: T): void;
    removeEntities(filter: (e: T) => boolean): void;
}
interface BruteForceMessage extends Array<IdProvider> {
}
interface Diff {
    create: Array<any>;
    modify: Array<any>;
    remove: Array<any>;
}
interface ReplicatorClientFactory {
    (s: ClientState): ReplicatorClient<any>;
}
interface ReplicatorClient<T> {
    onUpdate(message: T, batch: ReplicationClientStateBatch): void;
}
interface ReplicatorServerFactory {
    new (s: ServerReplicationState): ReplicatorServer<any>;
}
interface ReplicatorServer<T> {
    update(): Message<T>[];
    firstUpdate(): Message<T>[];
    typeId: number;
}
interface Server extends ConnectionAcceptor<CommandEvent | SyncEvent, GameEvent> {
    createUser(listener: GameListener): User;
}
interface ClientState {
    createBatch(): ClientStateBatch;
    get(id: number): any;
    forEach(callback: (e: IdProvider) => void): void;
}
interface ClientStateBatchCommon {
    remove(id: number): void;
    create(data: IdProvider): void;
}
interface ReplicationClientStateBatch extends ClientStateBatchCommon {
    forEach(callback: (e: IdProvider) => void): void;
    merge(data: IdProvider): void;
}
interface ClientStateBatch extends ClientStateBatchCommon {
    apply(): void;
    update(data: IdProvider): void;
}
interface EntityData extends IdProvider {
    attrs: {
        [index: string]: any;
    };
    links: {
        [index: string]: number;
    };
}
interface Entity extends IdProvider {
    set(name: string, value: any): void;
    get(name: string): any;
    attach(name: string, value: Entity): void;
    attachId(name: string, value: number): void;
    getLink(name: string): Entity;
    forEach(callback: (key: string, value: any) => void): void;
    toObject(): EntityData;
    merge(e: EntityData): void;
}
interface ServerReplicationState {
    forEach(callback: (e: IdProvider) => void): void;
}
interface ServerState extends ServerReplicationState {
    transform(real: any): IdProvider;
    onRemove: (instance: any) => void;
}
interface User extends GameListener {
    addUserGame(userGame: UserGame): number;
    forEachUserGame(callback: (ug: UserGame) => void): void;
    getUserGame(id: number): UserGame;
}
declare module "mp-engine"{var _:Main;export=_}