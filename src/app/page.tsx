import Door from "@/components/DoorScene";

const Home = () => {
  return (
    <>
      {/* <h1 className="text-3xl font-bold underline text-indigo-400">Home</h1> */}
      <Door
        englishText="Pouria Tavakoli"
        farsiText="پوریا برادران توکلی"
        englishFontJsonPath="/assets/fonts/helvetiker_regular.typeface.json"
        farsiFontPath="/assets/fonts/Mj Silicon Bold.typeface.json"
      />
    </>
  );
};

export default Home;
