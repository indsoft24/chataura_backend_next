import { Module, forwardRef } from '@nestjs/common';
import { RelationshipModule } from '../relationship/relationship.module';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { LedgerService } from './ledger.service';
import { BalanceReconciliationService } from './balance-reconciliation.service';

@Module({
  imports: [forwardRef(() => RelationshipModule)],
  controllers: [WalletController],
  providers: [WalletService, LedgerService, BalanceReconciliationService],
  exports: [WalletService, LedgerService, BalanceReconciliationService],
})
export class WalletModule {}
