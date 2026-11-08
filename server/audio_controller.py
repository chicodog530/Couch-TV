import logging

logger = logging.getLogger(__name__)

class AudioController:
    def __init__(self):
        self._endpoint_volume = None
        self._init_endpoint()

    def _init_endpoint(self):
        try:
            from pycaw.pycaw import AudioUtilities
            speakers = AudioUtilities.GetSpeakers()
            if hasattr(speakers, 'EndpointVolume'):
                self._endpoint_volume = speakers.EndpointVolume
            else:
                logger.warning("AudioUtilities.GetSpeakers() has no EndpointVolume")
        except Exception as e:
            logger.error(f"Failed to initialize pycaw endpoint volume: {e}")
            self._endpoint_volume = None

    def get_volume(self) -> int:
        if not self._endpoint_volume:
            self._init_endpoint()
        if self._endpoint_volume:
            try:
                scalar = self._endpoint_volume.GetMasterVolumeLevelScalar()
                return int(round(scalar * 100))
            except Exception as e:
                logger.error(f"Error getting volume: {e}")
        return 50

    def set_volume(self, percent: int) -> int:
        percent = max(0, min(100, int(percent)))
        if not self._endpoint_volume:
            self._init_endpoint()
        if self._endpoint_volume:
            try:
                self._endpoint_volume.SetMasterVolumeLevelScalar(percent / 100.0, None)
                return percent
            except Exception as e:
                logger.error(f"Error setting volume: {e}")
        return percent

    def is_muted(self) -> bool:
        if not self._endpoint_volume:
            self._init_endpoint()
        if self._endpoint_volume:
            try:
                return bool(self._endpoint_volume.GetMute())
            except Exception as e:
                logger.error(f"Error checking mute: {e}")
        return False

    def set_mute(self, muted: bool) -> bool:
        if not self._endpoint_volume:
            self._init_endpoint()
        if self._endpoint_volume:
            try:
                self._endpoint_volume.SetMute(1 if muted else 0, None)
                return muted
            except Exception as e:
                logger.error(f"Error setting mute: {e}")
        return muted

    def toggle_mute(self) -> bool:
        new_state = not self.is_muted()
        return self.set_mute(new_state)

audio_ctrl = AudioController()
