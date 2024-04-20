// a channel in go.
// our implementation will not support buffered channels,
// which will be a future feature.
export class Channel {
    public hasItem: boolean = false;
    public done: boolean = false;
    public item: any = null;
    constructor() {}
    
    isFull(): boolean {
        return this.hasItem;
    }

    isEmpty(): boolean {
        return !this.hasItem;
    }

    receive(): any {
        if (!this.hasItem) {
            return null;
        }
        this.hasItem = false;
        //console.log("item taken from channel");
        return this.item;
    }

    send(item: any) {
        this.item = item;
        this.hasItem = true;
        //console.log("item sent to channel")
    }

    toString() {
        return `Channel(hasItem: ${this.hasItem}, item: ${this.item})`;
    }
}