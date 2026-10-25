import DatasetGeoJoiner from './DatasetGeoJoiner';
import AcsColumnSelector from './AcsColumnSelector';

function App() {
    return (
        <>
            <main>
                <h1>Open Source with SLU | Enrollment Dashboard</h1>
                <DatasetGeoJoiner />
                <AcsColumnSelector />
            </main>
        </>
    );
}

export default App;
