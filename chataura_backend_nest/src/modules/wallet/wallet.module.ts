import { Module, forwardRef } from '@nestjs/common';
import { RelationshipModule } from '../relationship/relationship.module';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { LedgerService } from './ledger.service';

@Module({
  imports: [forwardRef(() => RelationshipModule)],
  controllers: [WalletController],
  providers: [WalletService, LedgerService],
  exports: [WalletService, LedgerService],
})
export class WalletModule {}
