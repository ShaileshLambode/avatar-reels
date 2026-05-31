const ScriptService = require('./ScriptService');
const VoiceService = require('./VoiceService');
const AvatarService = require('./AvatarService');
const CompositionService = require('./CompositionService');
const CaptionService = require('./CaptionService');

const scriptService = new ScriptService();
const voiceService = new VoiceService();
const avatarService = new AvatarService();
const compositionService = new CompositionService();
const captionService = new CaptionService();

module.exports = {
  scriptService,
  ScriptService,
  voiceService,
  VoiceService,
  avatarService,
  AvatarService,
  compositionService,
  CompositionService,
  captionService,
  CaptionService
};


