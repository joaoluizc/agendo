import React from "react";
import { useLottie } from "lottie-react";
import sleepyCat from './resources/sleepy-cat.json'


const NotFound: React.FC = () => {
    const lottieOptions = {
        animationData: sleepyCat,
        loop: true
    };
    const lottieStyle = {
        height: 300,
      };
    const { View } = useLottie(lottieOptions, lottieStyle);

    return (
        <div className="flex flex-col justify-center content-center text-center">
            {View}
            <h1 className="text-3xl font-semibold">You found a sleepy cat</h1>
            <h2 className="text-xl">Error 404</h2>
        </div>
    );
}

export default NotFound;