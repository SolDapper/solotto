import {Connection, PublicKey, TransactionMessage, TransactionInstruction, VersionedTransaction, ComputeBudgetProgram, SystemProgram, Keypair, SYSVAR_SLOT_HASHES_PUBKEY, SYSVAR_CLOCK_PUBKEY, SYSVAR_RECENT_BLOCKHASHES_PUBKEY} from '@solana/web3.js';
import bs58 from 'bs58';
import BN from 'bn.js';
import {createMemoInstruction} from '@solana/spl-memo';
import BufferLayout from "buffer-layout";
const publicKey=(property="publicKey")=>{return BufferLayout.blob(32,property);};const uint64=(property="uint64")=>{return BufferLayout.blob(8,property);}
import {createSolanaRpcSubscriptions} from "@solana/kit";
import {EventEmitter} from 'events';

const INSTRUCTIONS = {
    INITIALIZE_LOTTERY: 0,
    BUY_TICKET: 1,
    DRAW_WINNER: 2,
    CLAIM_PRIZE: 3,
    LOCK_LOTTERY: 4,
    RELEASE_EXPIRED: 5,
};

class LotteryNetwork {
    /*** @param {Connection} connection - Solana connection */
    constructor(connection){this.connection=connection;}
    async Tx(_data_){
        let _obj_={};let _account_;let _instructions_;let _signers_;let _priority_;let _tolerance_;let _serialize_;let _encode_;let _table_;let _compute_;let _fees_;let _memo_;
        if(typeof _data_.account=="undefined"){_obj_.message="missing account";return _obj_;}else{_account_=_data_.account;}
        if(typeof _data_.instructions=="undefined"){_obj_.message="missing instructions";return _obj_;}else{_instructions_=_data_.instructions;}
        if(typeof _data_.signers=="undefined" || _data_.signers==false){_signers_=false;}else{_signers_=_data_.signers;}
        if(typeof _data_.priority=="undefined"){_priority_="Low";}else{_priority_=_data_.priority;}
        if(typeof _data_.tolerance=="undefined" || _data_.tolerance==false){_tolerance_=1.1;}else{_tolerance_=_data_.tolerance;}
        if(typeof _data_.serialize=="undefined"){_serialize_=false;}else{_serialize_=_data_.serialize;}
        if(typeof _data_.encode=="undefined"){_encode_=false;}else{_encode_=_data_.encode;}
        if(typeof _data_.compute=="undefined"){_compute_=true;}else{_compute_=_data_.compute;}
        if(typeof _data_.fees=="undefined"){_fees_=true;}else{_fees_=_data_.fees;}
        if(typeof _data_.table=="undefined" || _data_.table==false){_table_=[];}else{_table_=[_data_.table];}
        if(typeof _data_.memo!="undefined" && _data_.memo!=false){_memo_=_data_.memo;}else{_memo_=false;}
        const _wallet_ = new PublicKey(_account_);
        const _blockhash_ = (await this.connection.getLatestBlockhash('confirmed')).blockhash;
        if(_priority_=="Extreme"){_priority_="VeryHigh";}
        let _payer_ = { publicKey : _wallet_ }
        if(_memo_ != false){const memoIx = createMemoInstruction(_memo_,[new PublicKey(_account_)]);_instructions_.push(memoIx);}
        if(_compute_ != false){
            let _cu_ = null;
            _cu_= await this.Compute(_wallet_,_instructions_,_tolerance_,_blockhash_,_table_);
            if(typeof _cu_.logs != "undefined"){
                _obj_.status="error";
                _cu_.message="there was an error when simulating the transaction";
                return _cu_;
            }
            else if(_cu_==null){
                _obj_.status="error";
                _obj_.message="there was an error when optimizing compute limit";
                return _obj_;
            }
            _instructions_.unshift(ComputeBudgetProgram.setComputeUnitLimit({units:_cu_}));
        }
        if(_fees_ != false){
            const get_priority = await this.Estimate(_payer_,_priority_,_instructions_,_blockhash_,_table_);
            _instructions_.unshift(ComputeBudgetProgram.setComputeUnitPrice({microLamports:get_priority}));
        }
        let _message_ = new TransactionMessage({payerKey:_wallet_,recentBlockhash:_blockhash_,instructions:_instructions_,}).compileToV0Message(_table_);
        let _tx_ = new VersionedTransaction(_message_);
        if(_signers_!=false){
            _tx_.sign(_signers_);
        }
        if(_serialize_ === true){
            _tx_=_tx_.serialize();
        }
        if(_encode_ === true){
            _tx_= Buffer.from(_tx_).toString("base64");
        }
        _obj_.status="ok";
        _obj_.message="success";
        _obj_.transaction=_tx_;
        return _obj_;
    }
    async Send(tx){
        try{
            const signature = await this.connection.sendRawTransaction(tx.serialize(),{skipPreflight:true,maxRetries:0});
            return signature;
        }
        catch(err){
            const _error_ = {}
            _error_.status="error";
            _error_.message=err;
            return _error_;
        }
    }
    async Status(sig,max=10,int=3){
        return await new Promise(resolve=>{
            let start = 1;          
            let intervalID = setInterval(async()=>{
            let tx_status = null;
            tx_status = await this.connection.getSignatureStatuses([sig], {searchTransactionHistory: true,});
            if (tx_status == null || 
            typeof tx_status.value == "undefined" || 
            tx_status.value == null || 
            tx_status.value[0] == null || 
            typeof tx_status.value[0] == "undefined" || 
            typeof tx_status.value[0].confirmationStatus == "undefined"){
                // console.log("trying again...");
            } 
            else if(tx_status.value[0].confirmationStatus == "processed"){
                start = 1;
            }
            else if(tx_status.value[0].confirmationStatus == "confirmed"){
                // console.log("confirming...");
                start = 1;
            }
            else if (tx_status.value[0].confirmationStatus == "finalized"){
                if(tx_status.value[0].err != null){
                resolve('program error!');
                clearInterval(intervalID);
                }
                resolve('finalized');
                clearInterval(intervalID);
            }
            start++;
            if(start == max + 1){
                resolve((max * int)+' seconds max wait reached');
                clearInterval(intervalID);
            }
            },(int * 1000));
        });  
    }
    async Compute(payer,ix,tolerance,blockhash,table=false){
        const sim_limit = ComputeBudgetProgram.setComputeUnitLimit({units:1400000});
        const fee_limit = ComputeBudgetProgram.setComputeUnitPrice({microLamports:10000});
        let re = []; for (let o in ix) {re.push(ix[o]);}
        ix = re; ix.unshift(sim_limit); ix.unshift(fee_limit);
        const msg = new TransactionMessage({payerKey:payer,recentBlockhash:blockhash,instructions:ix,}).compileToV0Message(table);
        const tx = new VersionedTransaction(msg);
        const res = await this.connection.simulateTransaction(tx,{replaceRecentBlockhash:true,sigVerify:false,});
        // console.log(res);
        if(res.value.err != null){return {"status":"error","message":"simulation error","details":res.value.err,"logs":res.value.logs};}
        const consumed = res.value.unitsConsumed;
        return Math.ceil(consumed * tolerance);
    }
    async Estimate(payer,priority_level,instructions,blockhash,table=false){
        let re_ix = [];
        for (let o in instructions) {re_ix.push(instructions[o]);}
        instructions = re_ix;
        const _msg = new TransactionMessage({payerKey:payer.publicKey,recentBlockhash:blockhash,instructions:instructions,}).compileToV0Message(table);
        const tx = new VersionedTransaction(_msg);
        const response = await fetch(this.connection.rpcEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
            jsonrpc: "2.0",
            id: "1",
            method: "getPriorityFeeEstimate",
            params: [
                {
                transaction: bs58.encode(tx.serialize()), // Pass the serialized transaction in Base58
                options: { priorityLevel: priority_level },
                },
            ],
            }),
        });
        let data = await response.json();
        data = parseInt(data.result.priorityFeeEstimate);
        if(data == 1){data = 100000;}
        if(data < 10000){data = 10000;}
        return data;
    }
}

class Lottery extends EventEmitter {

    /*** 
    * @param {Connection} connection - Solana connection
    * @param {String} wss - Web Socket URL 
    * @param {PublicKey} program - Lottery Program Id 
    */
    constructor(connection, wss = false, program){
        super();
        this.connection=connection;
        this.wss=wss;
        this.program=program;
        this.TICKET_STATE = BufferLayout.struct([
            publicKey("owner"),
            publicKey("lottery"),
            publicKey("ticketReceipt"),
            uint64("ticketNumber"),    
        ]);
    }

    /*** 
    */
    async WatchDraw(){
        const self = this;
        const RECONNECT_DELAY = 5000; // 5 seconds
        
        async function connect() {
            try{
                console.log('WatchDraw: Connecting to websocket...');
                const abortController = new AbortController();
                const subscriptions = createSolanaRpcSubscriptions(self.wss, {intervalMs: 30000});
                const allNotifications = await subscriptions.logsNotifications(
                    {
                        mentions: [self.program.toString()]
                    },
                    {
                        commitment: "finalized"
                    }
                ).subscribe({abortSignal:abortController.signal});
                
                console.log('WatchDraw: Connected successfully');
                self.emit('connected');
                
                for await (const noti of allNotifications) {
                    const signature = noti.value.signature;
                    const logs = noti.value.logs;
                    const pattern_1 = "Program log: Winning ticket number: ";
                    const pattern_2 = "Program log: Fee amount: ";                
                    let winningTicketNumber = 0;
                    let isDraw = false;
                    for await (const log of logs) {
                        if(log.includes(pattern_1)){
                            winningTicketNumber = parseInt(log.replace(pattern_1, ""));
                        }
                        if(log.includes(pattern_2)){
                            isDraw = true;
                        }
                    }
                    if(isDraw){
                        self.emit('draw', { winningTicketNumber, signature });
                    }
                }
            }
            catch(err){
                console.log('WatchDraw: Connection error:', err);
                self.emit('error', err);
                console.log(`WatchDraw: Reconnecting in ${RECONNECT_DELAY/1000} seconds...`);
                self.emit('reconnecting', { delay: RECONNECT_DELAY });
                setTimeout(() => {
                    connect();
                }, RECONNECT_DELAY);
            }
        }
        
        // Start the connection
        connect();
    }
    
    /*** 
     * @param {PublicKey} authority - Keypair with no secretKey
     * @param {Number} lotteryId - Lottery Id Number
     * @param {PublicKey} winner - Keypair with no secretKey
     * @param {Boolean} encoded - true returns encoded transaction
    */
    async ClaimTicket(authority, lotteryId, winner, encoded = false){
        async function claimData() {
            const buffer = Buffer.alloc(1);
            buffer.writeUInt8(INSTRUCTIONS.CLAIM_PRIZE, 0);
            return buffer;
        }
        const network = new LotteryNetwork(this.connection);
        const LOTTO = await this.GetLottery(authority, lotteryId);
        const TICKET_NUMBER = LOTTO.winnerTicketNumber;
        LOTTO.ticket = await this.GetTicket(authority, lotteryId, TICKET_NUMBER);
        const keys = [
            { pubkey: new PublicKey(LOTTO.ticket.ticketOwner), isSigner: true, isWritable: true },
            { pubkey: new PublicKey(LOTTO.ticket.lotteryAddress), isSigner: false, isWritable: true },
            { pubkey: new PublicKey(LOTTO.ticket.ticketReceipt), isSigner: false, isWritable: false },
            { pubkey: new PublicKey(LOTTO.ticket.ticketPda), isSigner: false, isWritable: false },
            { pubkey: new PublicKey(LOTTO.prizePoolAddress), isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ];
        const ix = new TransactionInstruction({programId: this.program, keys, data: await claimData()});
        const _tx_ = {};
        _tx_.account = LOTTO.ticket.ticketOwner;       // string : required
        _tx_.instructions = [ix];                      // array  : required
        _tx_.signers = false;                          // array  : default false
        _tx_.table = false;                            // array  : default false
        _tx_.tolerance = 1.2;                          // int    : default 1.1    
        _tx_.compute = true;                           // bool   : default true
        _tx_.fees = true;                              // bool   : default true
        _tx_.priority = "Low"; 
        if(encoded){
            _tx_.serialize = true;                        
            _tx_.encode = true;  
        }
        else{
            _tx_.serialize = false;                        
            _tx_.encode = false;  
        }
        const tx = await network.Tx(_tx_);
        if(winner.secretKey && !encoded){
            tx.transaction.sign([winner]);
            const sig = await network.Send(tx.transaction);
            console.log("Signature:", sig);
            return await network.Status(sig);
        }
        else{return tx;}
    }
    
    /*** 
     * @param {PublicKey} buyer - Keypair with no secretKey
     * @param {PublicKey} authority - Keypair with no secretKey
     * @param {Number} lotteryId - Lottery Id Number
     * @param {Number} amount - Ticket Qty 1-4
     * @param {Boolean} encoded - true returns encoded transaction
    */
    async BuyTickets(buyer, authority, lotteryId, amount = 1, encoded = false){
        const network = new LotteryNetwork(this.connection);
        const result = await this.BundleTickets(authority, buyer, lotteryId, amount);
        const _tx_ = {};
        _tx_.account = buyer.publicKey.toString();     // string : required
        _tx_.instructions = result.ixs;                // array  : required
        _tx_.signers = result.signers;                 // array  : default false
        _tx_.table = false;                            // array  : default false
        _tx_.tolerance = 1.2;                          // int    : default 1.1    
        _tx_.compute = true;                           // bool   : default true
        _tx_.fees = true;                              // bool   : default true
        _tx_.priority = "Low"; 
        if(encoded){
            _tx_.serialize = true;                        
            _tx_.encode = true;  
        }
        else{
            _tx_.serialize = false;                        
            _tx_.encode = false;  
        }
        const tx = await network.Tx(_tx_);
        if(buyer.secretKey && !encoded){
            tx.transaction.sign([buyer]);
            const sig = await network.Send(tx.transaction);
            console.log("Signature:", sig);
            return await network.Status(sig);
        }
        else{return tx;}
    }
    async BundleTickets(authority, buyer, lotteryId, amount) {
        async function ticketData() {
            const buffer = Buffer.alloc(1);
            buffer.writeUInt8(INSTRUCTIONS.BUY_TICKET, 0); // BuyTicket discriminator
            return buffer;
        }
        const [lotteryPDA] = await this.DeriveLotteryPDA(authority.publicKey, lotteryId);
        const [prizePoolPDA] = await this.DerivePrizePoolPDA(lotteryPDA);
        const ixs = [];
        const signers = [];
        let i = 0;
        while (i < amount) {
            const ticketReceipt = new Keypair();
            signers.push(ticketReceipt);
            const rent = await this.connection.getMinimumBalanceForRentExemption(0);
            const createReceiptAccountIx = SystemProgram.createAccount({
                programId: this.program,
                space: 0,
                lamports: rent,
                fromPubkey: buyer.publicKey,
                newAccountPubkey: ticketReceipt.publicKey
            });
            ixs.push(createReceiptAccountIx);
            const [ticketPDA] = await this.DeriveTicketPDA(lotteryPDA, buyer.publicKey, ticketReceipt.publicKey);
            const ix = new TransactionInstruction({
                keys: [
                    { pubkey: buyer.publicKey, isSigner: true, isWritable: true },
                    { pubkey: lotteryPDA, isSigner: false, isWritable: true },
                    { pubkey: ticketPDA, isSigner: false, isWritable: true },
                    { pubkey: prizePoolPDA, isSigner: false, isWritable: true },
                    { pubkey: ticketReceipt.publicKey, isSigner: true, isWritable: true },
                    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
                ],
                programId: this.program,
                data: await ticketData(),
            });
            ixs.push(ix);
            i++;
        }
        return {
            ixs,
            signers
        };
    }

    /*** 
     * @param {PublicKey} authority - Keypair with no secretKey
     * @param {Number} lotteryId - Lottery Id 
     * @param {Number} ticket - Ticket Number 
    */
    async GetTicket(authority, lotteryId, ticket) {
        async function numberToBase58(num, byteLength = 8) {
            const buffer = Buffer.alloc(byteLength);
            buffer.writeBigUInt64LE(BigInt(num), 0);
            return bs58.encode(buffer);
        }
        const [lotteryPDA] = await this.DeriveLotteryPDA(authority.publicKey, lotteryId);
        const data_ = await this.connection.getProgramAccounts(this.program, {
            filters:[
                {dataSize: 104},
                {memcmp:{
                    offset: 32,
                    bytes: lotteryPDA.toString(),
                },},
                {memcmp:{
                    offset: 96,
                    bytes: await numberToBase58(ticket),
                },},
            ],
        });
        const data = data_[0];
        const accountInfo = await this.connection.getAccountInfo(data.pubkey);
        const decoded = this.TICKET_STATE.decode(accountInfo.data);
        const owner_ = new PublicKey(decoded.owner).toString();
        const lottery_ = new PublicKey(decoded.lottery).toString();
        const ticketReceipt_ = new PublicKey(decoded.ticketReceipt).toString();
        const ticketNumber_ = parseInt(new BN(decoded.ticketNumber, 10, "le"));
        return {
            ticketOwner: owner_,
            ticketReceipt: ticketReceipt_,
            ticketNumber: ticketNumber_,
            ticketPda: data.pubkey.toString(),
            lotteryId: lotteryId,
            lotteryAddress: lottery_,
            lotteryAuth: authority.publicKey.toString(),
        };
    }

    /*** 
     * @param {PublicKey} authority - Keypair with no secretKey
     * @param {Number} lotteryId - Lottery Id 
     * @param {PublicKey} buyer - Ticket Buyer Optional
    */
    async GetTickets(authority, lotteryId, buyer = false) {
        async function numberToBase58(num, byteLength = 8) {
            const buffer = Buffer.alloc(byteLength);
            buffer.writeBigUInt64LE(BigInt(num), 0);
            return bs58.encode(buffer);
        }
        const [lotteryPDA] = await this.DeriveLotteryPDA(authority.publicKey, lotteryId);
        const filters = [];
        filters.push({dataSize: 104});
        if(buyer){filters.push({memcmp:{offset: 0, bytes: buyer.publicKey.toString(),},});}
        filters.push({memcmp:{offset: 32,bytes: lotteryPDA.toString(),},});
        const data_ = await this.connection.getProgramAccounts(this.program, {filters:filters,});
        const tickets = [];
        let i = 0;
        while(i < data_.length){
            const data = data_[i];
            const newTicket = {};
            const account = await this.connection.getAccountInfo(data.pubkey);
            const decoded = this.TICKET_STATE.decode(account.data);
            newTicket.owner = new PublicKey(decoded.owner).toString();
            newTicket.lottery = new PublicKey(decoded.lottery).toString();
            newTicket.ticketReceipt = new PublicKey(decoded.ticketReceipt).toString();
            newTicket.ticketNumber = parseInt(new BN(decoded.ticketNumber, 10, "le"));
            newTicket.ticketPda = data.pubkey.toString();
            tickets.push(newTicket);
            i++;
        }
        tickets.sort((a, b) => b.ticketNumber - a.ticketNumber);
        let _buyer_ = "All";
        if(buyer){_buyer_ = buyer.publicKey.toString();}
        return {
            lotteryId: lotteryId,
            lotteryAddress: lotteryPDA.toString(),
            lotteryAuth: authority.publicKey.toString(),
            buyer: _buyer_,
            tickets: tickets,
        };
    }

    /*** 
     * @param {PublicKey} authority - Keypair with no secretKey
     * @param {Number} lotteryId - Lottery Id 
     * @param {Boolean} fees - true = prize pool - 10% (for display before drawing)
    */
    async GetLottery(authority, lotteryId, fees = true) {
        const [lotteryPDA] = await this.DeriveLotteryPDA(authority.publicKey, lotteryId);
        const account = await this.connection.getAccountInfo(lotteryPDA);
        return await this.DecodeLotteryState(account.data, fees);
    }
    async DecodeLotteryState(buffer, fees = true){
        let offset = 0;
        // Helper to handle the 1-byte Option flag
        const readOption = (readFn) => {
            const hasValue = buffer.readUInt8(offset) === 1;
            offset += 1;
            return hasValue ? readFn() : null;
        };
        // 1. authority: Pubkey (32 bytes)
        const auth = new PublicKey(buffer.slice(offset, offset + 32)).toString();
        offset += 32;
        // 2. lottery_id: u64 (8 bytes)
        const lotteryId = Number(buffer.readBigUInt64LE(offset));
        offset += 8;
        // 3. ticket_price: u64 (8 bytes)
        const ticketPrice = Number(buffer.readBigUInt64LE(offset));
        offset += 8;
        // 4. total_tickets: u64 (8 bytes)
        const totalTickets = Number(buffer.readBigUInt64LE(offset));
        offset += 8;
        // 5. winner_ticket_number: Option<u64> (1 + 8 bytes)
        const winnerTicketNumber = readOption(() => {
            const val = buffer.readBigUInt64LE(offset);
            offset += 8;
            return val;
        });

        // 6. winner_address: Option<Pubkey> (1 + 32 bytes)
        let winnerAddress = null;
        try{
            winnerAddress = readOption(() => {
                const val = buffer.slice(offset, offset + 32);
                offset += 32;
                return new PublicKey(val).toString();
            });
        }catch{}
        // 7. is_active: bool (1 byte)
        const isActive = buffer.readUInt8(offset) === 1;
        offset += 1;
        // 8. prize_pool: u64 (8 bytes)
        const prizePool = Number(buffer.readBigUInt64LE(offset));
        offset += 8;
        const drawInitiated = buffer.readUInt8(offset) === 1;
        offset += 1;
        // 9. draw_timestamp: Option<u64> (1 + 8 bytes)
        let releaseTime = null;
        try{
            releaseTime = readOption(() => {
                const val = buffer.readBigUInt64LE(offset);
                offset += 8;
                return Number(releaseTime);
            });
        }catch{}
        const prizePoolAddress = await this.DerivePrizePoolPDA();
        const lotteryAddress = await this.DeriveLotteryPDA(new PublicKey(auth), lotteryId);
        let prizePoolBalance = prizePool;
        if(fees){prizePoolBalance = prizePool - (prizePool * 0.1);}
        return {
            authority: auth,
            lotteryId,
            ticketPrice,
            totalTickets,
            winnerTicketNumber: Number(winnerTicketNumber),
            winnerAddress,
            isActive,
            prizePoolBalance,
            drawInitiated,
            prizePoolAddress: prizePoolAddress[0].toString(),
            lotteryAddress: lotteryAddress[0].toString(),
            release: lotteryAddress[0].toString(),
            releaseTime,
        };
    };

    /*** Derivation Helpers */
    async DeriveLotteryPDA(authority, lotteryId) {
        const idBuffer = Buffer.alloc(8);
        idBuffer.writeBigUInt64LE(BigInt(lotteryId));
        return PublicKey.findProgramAddressSync([Buffer.from("lottery"), authority.toBuffer(), idBuffer], this.program);
    }
    async DeriveTicketPDA(lotteryPDA, buyer, ticketReceipt) {
        const programId = this.program;
        return PublicKey.findProgramAddressSync(
            [
                Buffer.from("ticket"), 
                lotteryPDA.toBuffer(), 
                buyer.toBuffer(), 
                ticketReceipt.toBuffer()
            ],
            programId
        );
    }
    async DerivePrizePoolPDA() {
      return PublicKey.findProgramAddressSync([Buffer.from("prize-pool")], this.program);
    }

}

class LotteryManager {

    /*** 
    * @param {Connection} connection - Solana connection
    * @param {PublicKey} program - Lottery Program Id 
    */
    constructor(connection, program){this.connection=connection;this.program=program;}
    
    /*** 
     * @param {Keypair} authority - Keypair
     * @param {Number} ticketPrice - Number
     * @param {String} lotteryId - String 
     * @param {Boolean} encoded - true returns encoded transaction
    */
    async Initialize(authority, ticketPrice, lotteryId, encoded = false){
        const lottery = new Lottery(this.connection, false, this.program);
        const network = new LotteryNetwork(this.connection);
        async function initializeData(tketPrice, lotId) {
            const buffer = Buffer.alloc(17); // 1 byte discriminator + 8 bytes price + 8 bytes id
            buffer.writeUInt8(INSTRUCTIONS.INITIALIZE_LOTTERY, 0); // initializeLottery discriminator
            buffer.writeBigUInt64LE(BigInt(tketPrice), 1);
            buffer.writeBigUInt64LE(BigInt(lotId), 9);
            return buffer;
        }
        const [lotteryPDA, bump] = await lottery.DeriveLotteryPDA(authority.publicKey, lotteryId);
        console.log("Lottery PDA:", lotteryPDA.toString());
        const ix = new TransactionInstruction({
            keys: [
                { pubkey: authority.publicKey, isSigner: true, isWritable: true },
                { pubkey: lotteryPDA, isSigner: false, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            programId: this.program,
            data: await initializeData(ticketPrice, lotteryId),
        });
        const _tx_ = {};
        _tx_.account = authority.publicKey.toString(); // string : required
        _tx_.instructions = [ix];                      // array  : required
        _tx_.signers = false;                          // array  : default false
        _tx_.table = false;                            // array  : default false
        _tx_.tolerance = 1.2;                          // int    : default 1.1    
        _tx_.compute = true;                           // bool   : default true
        _tx_.fees = true;                              // bool   : default true
        _tx_.priority = "Low";                         // string : default Low
        if(encoded){
            _tx_.serialize = true;                        
            _tx_.encode = true;  
        }
        else{
            _tx_.serialize = false;                        
            _tx_.encode = false;  
        }
        const tx = await network.Tx(_tx_);                
        if(tx.status !== "ok"){return tx;}
        if(authority.secretKey && !encoded){
            tx.transaction.sign([authority]);
            const sig = await network.Send(tx.transaction);
            console.log("Signature:", sig);
            return await network.Status(sig);
        }
        else{return tx;}
    }

    /**
     * @param {Keypair} authority - Keypair
     * @param {String} lotteryId - The lottery id
     * @param {Boolean} encoded - true returns encoded transaction
    */
    async RandomDraw(authority, lotteryId, encoded = false) {
        try{
            async function randomnessData() {
                const buffer = Buffer.alloc(1);
                buffer.writeUInt8(INSTRUCTIONS.DRAW_WINNER, 0);
                return buffer;
            }
            const lottery = new Lottery(this.connection, false, this.program);
            const network = new LotteryNetwork(this.connection);
            const [lotteryPDA] = await lottery.DeriveLotteryPDA(authority.publicKey, lotteryId);
            const [prizePoolPDA] = await lottery.DerivePrizePoolPDA();
            const keys = [
                { pubkey: authority.publicKey, isSigner: true, isWritable: false },
                { pubkey: lotteryPDA, isSigner: false, isWritable: true },
                { pubkey: SYSVAR_SLOT_HASHES_PUBKEY, isSigner: false, isWritable: false },
                { pubkey: prizePoolPDA, isSigner: false, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ];
            const ix = new TransactionInstruction({programId: this.program, keys, data: await randomnessData()});
            const _tx_ = {};
            _tx_.account = authority.publicKey.toString(); // string : required
            _tx_.instructions = [ix];                      // array  : required
            _tx_.signers = false;                          // array  : default false
            _tx_.table = false;                            // array  : default false
            _tx_.tolerance = 1.2;                          // int    : default 1.1    
            _tx_.compute = true;                           // bool   : default true
            _tx_.fees = true;                              // bool   : default true
            _tx_.priority = "Low";                         // string : default Low
            _tx_.memo = "draw";
            if(encoded){
                _tx_.serialize = true;                        
                _tx_.encode = true;  
            }
            else{
                _tx_.serialize = false;                        
                _tx_.encode = false;  
            }
            const tx = await network.Tx(_tx_);             // build the tx
            if(tx.status !== "ok"){return tx;}
            if(authority.secretKey && !encoded){
                tx.transaction.sign([authority]);
                const sig = await network.Send(tx.transaction);
                console.log("Signature:", sig);
                const status = await network.Status(sig);
                if(status == "finalized"){
                    return await lottery.GetLottery({publicKey: authority.publicKey}, lotteryId, false);
                }
                else{return status;}
            }
            else{return tx;}
        } 
        catch (error) {
            console.log(error);
        }
    }

    /**
     * @param {Keypair} authority - Keypair
     * @param {String} lotteryId - The lottery id
     * @param {Number} lockState - 0 = lock ticket sales, 1 = unlock (requires authority)
     * @param {Boolean} encoded - true returns encoded transaction
    */
    async LockLottery(authority, lotteryId, lockState, encoded = false) {
        try{
            async function lockData(lock) {
                const buffer = Buffer.alloc(2); // 1 byte discriminator + 1 bytes lock status
                buffer.writeUInt8(INSTRUCTIONS.LOCK_LOTTERY, 0); // lock discriminator
                buffer.writeUInt8(lock, 1); // write the new lock status
                return buffer;
            }
            const lottery = new Lottery(this.connection, false, this.program);
            const network = new LotteryNetwork(this.connection);
            const [lotteryPDA] = await lottery.DeriveLotteryPDA(authority.publicKey, lotteryId);
            const keys = [
                { pubkey: authority.publicKey, isSigner: true, isWritable: false },
                { pubkey: lotteryPDA, isSigner: false, isWritable: true },
            ];
            const ix = new TransactionInstruction({programId: this.program, keys, data: await lockData(lockState)});
            const _tx_ = {};
            _tx_.account = authority.publicKey.toString(); // string : required
            _tx_.instructions = [ix];                      // array  : required
            _tx_.signers = false;                          // array  : default false
            _tx_.table = false;                            // array  : default false
            _tx_.tolerance = 1.2;                          // int    : default 1.1    
            _tx_.compute = true;                           // bool   : default true
            _tx_.fees = true;                              // bool   : default true
            _tx_.priority = "Low";                         // string : default Low
            _tx_.memo = false;
            if(encoded){
                _tx_.serialize = true;                        
                _tx_.encode = true;  
            }
            else{
                _tx_.serialize = false;                        
                _tx_.encode = false;  
            }
            const tx = await network.Tx(_tx_);             // build the tx
            if(tx.status !== "ok"){return tx;}
            if(authority.secretKey && !encoded){
                tx.transaction.sign([authority]);
                const sig = await network.Send(tx.transaction);
                console.log("Signature:", sig);
                const status = await network.Status(sig);
                if(status == "finalized"){
                    return await lottery.GetLottery({publicKey: authority.publicKey}, lotteryId, false);
                }
                else{return status;}
            }
            else{return tx;}           
        }
        catch (error) {
            console.log(error);
        }
    }

    /**
     * @param {Keypair} authority - Keypair
     * @param {String} lotteryId - The lottery id
     * @param {Boolean} encoded - true returns encoded transaction
    */
    async ClaimExpired(authority, lotteryId, encoded = false) {
        try{
            async function expiredData() {
                const buffer = Buffer.alloc(1); // 1 byte discriminator + 1 bytes lock status
                buffer.writeUInt8(INSTRUCTIONS.RELEASE_EXPIRED, 0); // lock discriminator
                return buffer;
            }
            const lottery = new Lottery(this.connection, false, this.program);
            const network = new LotteryNetwork(this.connection);
            const [lotteryPDA] = await lottery.DeriveLotteryPDA(authority.publicKey, lotteryId);
            const LOTTO = await lottery.GetLottery(authority, lotteryId);
            const keys = [
                { pubkey: authority.publicKey, isSigner: true, isWritable: true },
                { pubkey: lotteryPDA, isSigner: false, isWritable: true },
                { pubkey: new PublicKey(LOTTO.prizePoolAddress), isSigner: false, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ];
            const ix = new TransactionInstruction({programId: this.program, keys, data: await expiredData()});
            const _tx_ = {};
            _tx_.account = authority.publicKey.toString(); // string : required
            _tx_.instructions = [ix];                      // array  : required
            _tx_.signers = false;                          // array  : default false
            _tx_.table = false;                            // array  : default false
            _tx_.tolerance = 1.2;                          // int    : default 1.1    
            _tx_.compute = true;                           // bool   : default true
            _tx_.fees = true;                              // bool   : default true
            _tx_.priority = "Low";                         // string : default Low
            _tx_.memo = false;
            if(encoded){
                _tx_.serialize = true;                        
                _tx_.encode = true;  
            }
            else{
                _tx_.serialize = false;                        
                _tx_.encode = false;  
            }
            const tx = await network.Tx(_tx_);             // build the tx
            if(tx.status !== "ok"){return tx;}
            if(authority.secretKey && !encoded){
                tx.transaction.sign([authority]);
                const sig = await network.Send(tx.transaction);
                console.log("Signature:", sig);
                const status = await network.Status(sig);
                if(status == "finalized"){
                    return await lottery.GetLottery({publicKey: authority.publicKey}, lotteryId, false);
                }
                else{return status;}
            }
            else{return tx;}           
        }
        catch (error) {
            console.log(error);
        }
    }

}

export {
    Lottery,
    LotteryNetwork,
    LotteryManager
}