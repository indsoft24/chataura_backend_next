import { Module, forwardRef } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { RelationshipController } from './relationship.controller';
import { RelationshipEngineService } from './relationship-engine.service';
import { RelationshipService } from './relationship.service';

@Module({
  imports: [forwardRef(() => WalletModule)],
  controllers: [RelationshipController],
  providers: [RelationshipEngineService, RelationshipService],
  exports: [RelationshipEngineService, RelationshipService],
})
export class RelationshipModule {}
