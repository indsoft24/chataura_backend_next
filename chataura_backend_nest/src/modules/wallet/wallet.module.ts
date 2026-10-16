import { Module, forwardRef } from '@nestjs/common';
import { RelationshipModule } from '../relationship/relationship.module';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { LedgerService } from './ledger.service';
import { BalanceReconciliationService } from './balance-reconciliation.service';
import { CoinSellerService } from './coin-seller.service';

@Module({
  imports: [forwardRef(() => RelationshipModule)],
  controllers: [WalletController],
  providers: [WalletService, LedgerService, BalanceReconciliationService, CoinSellerService],
  exports: [WalletService, LedgerService, BalanceReconciliationService, CoinSellerService],
})
export class WalletModule {}
