import React from "react";
import { Composition } from "remotion";
import { CaptionedVideo } from "./CaptionedVideo";
import { CaptionProps } from "./types";

const defaultProps: CaptionProps = {
  videoSrc: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  captions: [
    { text: "This", startMs: 0, endMs: 500 },
    { text: "is", startMs: 500, endMs: 1000 },
    { text: "a", startMs: 1000, endMs: 1500 },
    { text: "sample", startMs: 1500, endMs: 2000 },
    { text: "caption", startMs: 2000, endMs: 2500 },
    { text: "test", startMs: 2500, endMs: 3000 }
  ],
  durationInFrames: 90,
  fps: 30,
  width: 1080,
  height: 1920,
  fontSize: 72,
  highlightColor: "#FFE600"
};

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="CaptionedVideo"
        component={CaptionedVideo}
        durationInFrames={300} // Default duration, overridden dynamically at render time
        fps={30}
        width={1080}
        height={1920}
        defaultProps={defaultProps}
      />
    </>
  );
};
