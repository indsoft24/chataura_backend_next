import { Controller, Get, Post } from '@nestjs/common';
import { CallService } from './call.service';

@Controller()
export class CallController {
  constructor(private readonly calls: CallService) {}

  @Get('call/_ping')
  ping() {
    this.calls.disabled();
  }

  @Get('call/token')
  token() {
    this.calls.disabled();
  }

  @Post('agora/token')
  agoraToken() {
    this.calls.disabled();
  }

  @Post('call/initiate')
  initiate() {
    this.calls.disabled();
  }

  @Post('call/accept')
  accept() {
    this.calls.disabled();
  }

  @Post('call/reject')
  reject() {
    this.calls.disabled();
  }

  @Post('call/end')
  end() {
    this.calls.disabled();
  }

  @Get('call/active/:userId')
  active() {
    this.calls.disabled();
  }

  @Get('call/status/:callId')
  status() {
    this.calls.disabled();
  }

  @Post('call/heartbeat')
  heartbeat() {
    this.calls.disabled();
  }

  @Post('call/webhooks/call-started')
  started() {
    this.calls.disabled();
  }

  @Post('call/webhooks/call-ended')
  ended() {
    this.calls.disabled();
  }

  @Get('calls/history')
  history() {
    this.calls.disabled();
  }
}
