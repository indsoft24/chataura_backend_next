import { Module } from '@nestjs/common';
import { RelationshipController } from './relationship.controller';
import { RelationshipEngineService } from './relationship-engine.service';
import { RelationshipService } from './relationship.service';

@Module({
  controllers: [RelationshipController],
  providers: [RelationshipEngineService, RelationshipService],
  exports: [RelationshipEngineService, RelationshipService],
})
export class RelationshipModule {}
